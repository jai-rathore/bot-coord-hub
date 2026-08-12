import { DEFAULT_PORT, startServer } from "./server.js";

const port = Number(process.env.PORT ?? DEFAULT_PORT);
startServer(port);
