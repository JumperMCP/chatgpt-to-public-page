import { randomToken } from "../src/security";
import { sha256 } from "../src/types";
const token = randomToken();
console.log(
  JSON.stringify(
    {
      token,
      RECOVERY_TOKEN_HASH: await sha256(token),
      RECOVERY_EXPIRES_AT: String(Date.now() + 3600000),
    },
    null,
    2,
  ),
);
