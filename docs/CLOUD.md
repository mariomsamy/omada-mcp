# Using the TP-Link cloud instead of a local controller

If your controller is the **Omada Cloud-Based Controller** (the web console is at an address like
`https://euw1-omada-cloud.tplinkcloud.com/`), point this server at the cloud *Open API* instead of a
local IP address.

## Which address to use

The web console (`<region>-omada-cloud...`) is **not** the API host. The Open API lives on the
"northbound" host for the same region:

| Region code | API base URL |
|---|---|
| `euw1` | `https://euw1-omada-northbound.tplinkcloud.com` |
| `use1` | `https://use1-omada-northbound.tplinkcloud.com` |
| `aps1` | `https://aps1-omada-northbound.tplinkcloud.com` |

You do not need to type the URL. Set the region code and the server builds it:

```bash
OMADA_CLOUD_REGION=euw1
OMADA_CLIENT_ID=<client id>
OMADA_CLIENT_SECRET=<client secret>
OMADA_OMADAC_ID=<controller id>
# leave OMADA_BASE_URL unset; strict TLS stays on
```

Rules enforced at startup:

- Set **either** `OMADA_CLOUD_REGION` **or** `OMADA_BASE_URL`, not both.
- The region must look like a region code (`euw1`, `use1`, ...), so it cannot be turned into another host.
- `OMADA_STRICT_SSL` must stay `true` in cloud mode.

## Getting the credentials

In the cloud console, create an Open API application in client-credentials ("Client") mode
(look under the platform-integration / Open API settings; exact menu names can differ between
controller versions). Copy the **Client ID**, **Client Secret** and the **Controller ID**
(this is `OMADA_OMADAC_ID`). Keep them in a file readable only by you, never in the repo.

## What to expect

- The request and response format is the same as a local controller, so every tool uses the same
  arguments. Only the host and your credentials change.
- Some endpoints are only available in "authorization code" mode and return
  `This interface only supports the authorization code mode`. That is a controller limit, not a bug.
- Cloud calls cross the internet and may be rate limited. The server retries token expiry once and
  does not retry other failures.
- The capability profiles are unchanged: start with `safe-read`.

## Claude Code example

```bash
claude mcp add omada-cloud --scope user \
  -e OMADA_CLOUD_REGION=euw1 \
  -e OMADA_CLIENT_ID=... -e OMADA_CLIENT_SECRET=... -e OMADA_OMADAC_ID=... \
  -- node /path/to/omada-mcp/dist/index.js
```

Prefer a launcher script that reads the credentials from a private file, as described in
[INSTALL.md](INSTALL.md), so secrets never appear in your shell history or config.

## Status

The cloud address handling is covered by unit tests, and the cloud host was confirmed to answer
the same token endpoint format as a local controller. It has **not** been exercised end to end with
a real cloud-based controller account, because that needs your cloud credentials. Run a read-only
tool such as `getServerCapabilities` and `listSites` first.
