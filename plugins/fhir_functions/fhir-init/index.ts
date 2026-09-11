import { seed } from "./src/seed"

try {
    await seed();
} catch (error) {
    // Logged, not rethrown. This runs at module evaluation, where an escaping
    // rejection takes the worker down and is reported as the runtime leaving
    // its event loop - which says nothing about FHIR and buries the real error.
    // Nothing else in the stack depends on this having succeeded, so the rest
    // of the deployment comes up and the failure stays readable.
    console.error("FHIR init failed:", error);
}
