import * as path from "path";

export class MigrationSource {

    async getMigrations() {
      const files = Deno.readDir(`${path.dirname(path.fromFileUrl(import.meta.url)).replace(/\/usr\/src/, '.').replace(/\/var\/tmp\/sb-compile-trex/, Deno.env.get("TREX_FUNCTION_PATH"))}/migrations`);
      let res = []
      for await (const f of files) {
        res.push(f.name)
      }

      return Promise.resolve(res.sort());
    }
  
    getMigrationName(migration) {
      return migration;
    }
  
    getMigration(migration)  {
          return import(`./migrations/${migration}`);
    }
  }
  