import * as dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

const dir = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(dir, "../../.env") });
