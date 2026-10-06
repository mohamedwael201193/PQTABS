# Deployment

The production factory is `0x05545F026b75f03aE9Cf1eA8a8373473c94ed323` on Arc mainnet, chain id 5042. It was created in transaction `0xfade67cbf64d0869dbd33f53bd48844f0b3b4399d2c54b68c36a0b07ba30c916`. There is no second factory. Users create roots by calling `createRoot` on this one.

The backend is the Render web service `pqtabs` at `https://pqtabs.onrender.com`. The service id is `srv-db2mqpvavr4c73elkt60`. It is a free-plan Node service in Frankfurt. The build command is `npm ci && npm run build`. The start command is `npm start`. The health check path is `/health`.

After deploy `dep-db2mr5q6f5ic73d58gag` reached `live`, `GET /ready` returned chain id 5042, the factory address above, and `relayer: true`. `GET /v1/roots/0x846f56a8547Fe5cC3120c189c5640e84DAAB65Cf` returned the rotated verifying key, registrar `0xf76e6B0920e9332fF4410f6dD53F01722AbC71a3`, `openExposure` 0, and 139,998 raw USDC. Those match `deployments/mainnet.json`.

The relayer address is `0x5C7a54eEaF29310E758Fc6f010eCE827897D183e`. It was funded with 300,000 raw USDC in `0xccd44474a6f6cfe7d2132b86d1156b65972afeb929242b242e0a5b89acada240` so it can pay gas. That key is not the deployer key and it is not in git. Render holds it as an environment variable. The service does not have the deployer key, a PQ seed, or an agent key.

A restart request to the Render API returned 200, and `/ready` answered again with the same chain id and factory.

## Free plan limits

The free plan sleeps after inactivity and cold-starts on the next request. In-memory rate limits and the duplicate-transaction cache reset on sleep or restart. The chain nonce does not. A cold start can take tens of seconds, and `/health` is the path Render uses to decide the process is up. This is not a high-availability deployment.

The public RPC is `https://rpc.mainnet.arc.io`. `maxFeePerGas` is at least 20 gwei. Transactions below that floor are dropped by Arc without a receipt.
