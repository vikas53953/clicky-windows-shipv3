import { handleRequest } from "./router";
import type { WorkerEnv } from "./types";

export type { WorkerEnv };
export { handleRequest };

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env);
  }
};
