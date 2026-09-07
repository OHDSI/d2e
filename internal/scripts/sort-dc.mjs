#!/usr/bin/env zx
// sort and reorder docker-compose files
//  - top level: move 'services:' to end
//  - services: move 'environment' to end
// https://www.npmjs.com/package/yaml
// https://eemeli.org/yaml/#createnode-options
// Usage:
// 1. internal/scripts/sort-dc.mjs/sort-dc.mjs --backup --force # copy docker-compose* to docker-compose-private*
// 2. internal/scripts/sort-dc.mjs/sort-dc.mjs --update # update docker-compose files

$.verbose = false;
// $.verbose = true;

const domain = "${TLS__INTERNAL__DOMAIN:-d2e.local}";

let git_base_dir = (await $`git rev-parse --show-toplevel`).stdout.trim();
cd(git_base_dir);

let dcFiles = await glob(["docker-compose*.yml"], { ignore: ["**/*private*"] });
// dcFiles= ["docker-compose.yml"]
if (argv.files) {
  dcFiles = await glob([argv.files], { ignore: ["**/*private*"] });
}
echo(`INFO dcFiles: ${dcFiles}\n`);
if (dcFiles == "") {
  throw `EXIT: did not find ${argv.files}`;
}

// from https://codereview.stackexchange.com/questions/265820/using-javascript-given-a-json-value-recursively-find-all-json-objects-then-so
function sorted(o) {
  // object recursive sort
  const isObj = (x) => typeof x === "object";
  const isArr = Array.isArray;

  // Beware: null is type object, but is not sortable.
  const isSortable = (x) => x !== null && (isObj(x) || isArr(x));

  if (!isSortable(o)) return o;

  if (isArr(o)) return o.map(sorted);

  if (isObj(o))
    return Object.keys(o)
      .sort()
      .reduce(
        (m, x) => ((m[x] = isSortable(o[x]) ? sorted(o[x]) : o[x]), m),
        {}
      );
}

if (argv.remove) {
  dcFiles.forEach(async (dcFile) => {
    // echo(dcFile)
    let bakFile = dcFile.replace(".yml", "-private.yml");
    if (fs.existsSync(bakFile)) {
      fs.unlink(bakFile, (err) => {
        if (err) throw err;
        echo(`INFO: removed ${bakFile}`);
      });
    }
  });
}

if (argv.backup) {
  dcFiles.forEach(async (dcFile) => {
    // echo(dcFile)
    let bakFile = dcFile.replace(".yml", "-private.yml");
    let copyFileMode = argv.force ? 0 : fs.constants.COPYFILE_EXCL;
    fs.copyFile(dcFile, bakFile, copyFileMode, (err) => {
      if (err) throw err;
      echo(`INFO: created ${bakFile}`);
    });
  });
}

// dcFile='alp-data-node/docker-compose-dn-db-base.yml'
// dcFile='alp-data-node/docker-compose-standalone-base.yml'
// dcFile = 't1.yml'
if (argv.update) {
  const SERVICES = "services";
  const ENVIRONMENT = "environment";
  const ENTRYPOINT = "entrypoint";
  dcFiles.forEach(async (dcFile) => {
    // echo(dcFile)
    let bakFile = dcFile.replace(".yml", "-private.yml");
    echo(`INFO read ${bakFile}`);

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // stage 1: recursive sorts
    ////////////////////////////////////////////////////////////////////////////////////////////////
    let srcDocString = (await $`yq -P 'sort_keys(..)' ${bakFile}`).stdout;
    let srcDoc = YAML.parseDocument(srcDocString);
    // const { anchors, contents } = srcDoc
    // anchors.setAnchor(contents.items[0].value)
    // anchors.setAnchor(contents.items[2].value.items[1].value.items[1].value)
    // srcDoc.toJS()

    let svcDoc = srcDoc.get(SERVICES);
    // svcDoc.delete("alp-dataflow-gen.ports");
    // let i = 0
    for (let i = 0; i < svcDoc.items.length; i++) {
      if (argv.verbose)
        echo(`INFO ${bakFile} ${i} ${svcDoc.items[i].key.value}`);
      // anchors.setAnchor(svcDoc1.items[i].value)
      let appDoc = svcDoc.items[i].value;
      // YAML.stringify(appDoc)

      if (appDoc.has(ENTRYPOINT)) {
        let entryDoc = appDoc.get(ENTRYPOINT);
        let j = 0;
        if (typeof entryDoc === "string") {
          entryDoc = entryDoc.split(/;\s+/).join(";\n");
        } else {
          for (let j = 0; j < entryDoc.items.length; j++) {
            let entryValue = entryDoc.items[j].value;
            if (typeof entryValue === "string") {
              if (argv.verbose)
                echo(`INFO ${bakFile} i=${i} j=${j} ${entryValue}`);
              if (entryValue.match(/;/)) {
                let newValue = entryValue.split(/;\s+/).join(";\n");
                // .replaceAll(/;\s+/g,"; \n")
                entryDoc.items[j].value = newValue;
              }
            }
          }
        }
        // echo(entryDoc.toJSON())
        // echo(entryDoc.toJSON())
        appDoc.delete(ENTRYPOINT);
        appDoc.set(ENTRYPOINT, entryDoc);
      }

      if (appDoc.has(ENVIRONMENT)) {
        let envDoc = appDoc.get(ENVIRONMENT);
        let j = 0;
        for (let j = 0; j < envDoc.items.length; j++) {
          let envKey = envDoc.items[j].key.value;
          let envValue = envDoc.get(envKey);
          if (argv.verbose)
            echo(
              `INFO ${bakFile} i=${i} j=${j} ${envKey} ${typeof envValue} ${envValue}`
            );
          if (typeof envValue === "string") {
            if (envKey == "plugins") {
              console.debug(envValue);
            }
            /* 
            issue: https://github.com/data2evidence/alp/pull/160#discussion_r1510655218 
            exception: DB_CREDENTIALS__PUBLIC_KEYS must not be re-formatted until code fix 
            code: envKey != "DB_CREDENTIALS__PUBLIC_KEYS"
            fix: https://github.com/data2evidence/d2e/pull/31/files
            */
            if (envValue.match(/^{/)) {
              try {
                let envObj = JSON.parse(envValue);
                let sortedEnvObj = sorted(envObj);
                let prettyEnvStr = JSON.stringify(sortedEnvObj, null, 1);
                // echo(`INFO prettyEnvStr:${prettyEnvStr}`)
                envDoc.set(envKey, prettyEnvStr);
              } catch {
                echo(
                  `INFO ${bakFile} i=${i} j=${j} ${envKey} ${typeof envValue} ${envValue}`
                );
                await $`code ${bakFile}`;
                throw `INFO envValue:${envValue} is not valid json`;
              }
            } else if (envKey.match(/GATEWAY__API_ALLOWED_DOMAINS/)) {
              let newValue = envValue.split(/\s+/).sort().join("\n");
              envDoc.set(envKey, newValue);
            }
          }
        }
        appDoc.delete(ENVIRONMENT);
        appDoc.set(ENVIRONMENT, envDoc);
      }
      if (dcFile == "docker-compose.yml") {
        let container_name = appDoc.get("container_name", true);
        if (container_name == undefined) {
          echo(`INFO ${bakFile} ${i} ${svcDoc.items[i].key.value}`);
          // await $`code ${bakFile}`
          throw `ERROR container_name missing ${bakFile} ${i} ${svcDoc.items[i].key.value}`;
        }
        // appDoc.delete("extra_hosts");
        // appDoc.delete("hostname");
        // appDoc.delete("domainname");
        // appDoc.set("hostname", String(container_name));
        appDoc.set(
          "hostname",
          String(container_name) + ".${TLS__INTERNAL__DOMAIN:-d2e.local}"
        );
        // appDoc.set("domainname", String(container_name) + '.${TLS__INTERNAL__DOMAIN:-d2e.local}');

        container_name.anchor = `c${i}`;
        let alias = srcDoc.createAlias(container_name);
        appDoc.set("logging", { options: { tag: alias } });
        // appDoc.delete("networks");
        // let networks = appDoc.get("networks");
        // let networksObj = {}
        // for (const network of Array.from(Object.keys(networks.toJSON()))) {
        //   networksObj = Object.assign(networksObj, JSON.parse(`{"${network}": {} }`))
        //   // networksObj = Object.assign(networksObj, String(`${network}:`))
        //   // networksObj = Object.assign(networksObj, JSON.parse(`{"${network}": { "aliases": [ "${container_name}", "${container_name}.${domain}" ] }}`))
        // }
        // appDoc.set("networks", networksObj);
        // console.log(appDoc.get("networks"))
        // echo(YAML.stringify(appDoc.get('logging')))
      }
      if (appDoc.has(ENVIRONMENT)) {
        let appDocEnv = appDoc.get(ENVIRONMENT);
        appDoc.delete(ENVIRONMENT);
        appDoc.set(ENVIRONMENT, appDocEnv);
        // echo(YAML.stringify(appDoc))
      }
      // echo(YAML.stringify(appDoc))
    }
    // srcDoc1.toJS()

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // stage 2: reorder
    //  - top level: move 'services:' to end
    //  - services: move 'environment' to end
    ////////////////////////////////////////////////////////////////////////////////////////////////
    // move services to end
    if (srcDoc.has(SERVICES)) {
      let srcDocEnv = srcDoc.get(SERVICES);
      srcDoc.delete(SERVICES);
      srcDoc.set(SERVICES, srcDocEnv);
      // echo(YAML.stringify(srcDoc))
    }
    // https://eemeli.org/yaml/#tostring-options
    const stringifyOptions = {
      blockQuote: "literal",
      // blockQuote: 'folded',
      // defaultStringType: 'BLOCK_LITERAL',
      // defaultStringType: 'BLOCK_FOLDED',
      // defaultStringType : 'QUOTE_SINGLE',
      // doubleQuotedAsJSON: true,
      // indent: 2,
      // simpleKeys: true,
      lineWidth: 0,
      singleQuote: true,
    };
    let dstDocString = YAML.stringify(srcDoc, stringifyOptions);
    fs.writeFileSync(dcFile, dstDocString);

    // prettify
    dstDocString = (await $`echo ${dstDocString} | yq -P`).stdout;
    // dstDocString = (await $`yq -P ${dcFile}`).stdout;
    // await $`yq -P '.x-envs.plugins' ${dcFile}`

    // let dstDocString = YAML.stringify(srcDoc2, stringifyOptions).replace(/\n\n/g, '\n');
    // remove !!merge tag added by yq shown as syntax issue by vscode
    // dstDocString = dstDocString.replace(/\n\n/g, '\n');
    dstDocString = dstDocString.replaceAll("!!merge ", "");
    // dstDocString = dstDocString.replaceAll("|-", "|") //
    // dstDocString = dstDocString.replaceAll("|+", "|") //
    // add linebreak before each section
    dstDocString = dstDocString.replaceAll(/alp: {}/g, "alp:");
    dstDocString = dstDocString.replaceAll(/data: {}/g, "data:");
    dstDocString = dstDocString.replaceAll(/\n[a-zA-Z-]+:/g, "\n$&"); //
    // dstDocString = dstDocString.replaceAll(/ host.docker.internal:host-gateway\s/,'\"host.docker.internal:host-gateway"');
    // add linebreak before each service
    Object.keys(srcDoc.toJS().services).forEach((svcName) => {
      dstDocString = dstDocString.replace(
        `\n  ${svcName}:`,
        `\n\n  ${svcName}:`
      );
    });
    fs.writeFileSync(dcFile, dstDocString);
    echo(`INFO wrote ${dcFile}`);
    // await $`code --diff ${bakFile} ${dcFile}`;
  });
}
