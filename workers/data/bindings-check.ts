import worker from "./index";

// Keep Cloudflare globals out of the Next.js DOM type environment, while
// checking that the portable handlers accept the actual generated bindings.
const checked: ExportedHandler<WorkerEnv> = worker;
export default checked;
