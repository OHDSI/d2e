import { seed } from "./src/seed";

try {
  await seed();
} catch (error) {
  // Logged rather than left to escape. This runs at module evaluation, where an
  // escaping rejection takes the worker down and is reported as the runtime
  // leaving its event loop, naming neither this function nor what it was doing.
  // The blocks it creates are what the flows read their credentials from, so a
  // silent failure here surfaces much later as a flow that cannot find them.
  console.error("Dataflow init failed:", error);
}
