// Railway project for StudyBuddy: the Next.js app (web), the Python AI service (ai), Postgres
// with pgvector, and a bucket for uploaded materials. `railway config plan` previews changes to
// the live project and `railway config apply` makes them; see docs/deployment/RAILWAY.md.
import { bucket, defineRailway, postgres, preserve, project, ref, service, volume } from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "us-west2" });
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });
  const uploads = bucket("uploads", { region: "sjc" });

  // Both services read and write materials in the bucket.
  const s3 = {
    S3_BUCKET: ref(uploads, "BUCKET"),
    S3_ENDPOINT: ref(uploads, "ENDPOINT"),
    S3_REGION: ref(uploads, "REGION"),
    S3_ACCESS_KEY_ID: ref(uploads, "ACCESS_KEY_ID"),
    S3_SECRET_ACCESS_KEY: ref(uploads, "SECRET_ACCESS_KEY"),
  };
  // The web app reaches the AI service over the private network only.
  const aiServiceUrl = "http://${{ai.RAILWAY_PRIVATE_DOMAIN}}:8000";

  const ai = service("ai", {
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/health",
    healthcheckTimeout: 120,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "us-west2": 1 },
    env: {
      ENVIRONMENT: "production",
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: preserve(),
      AI_INTERNAL_TOKEN: preserve(),
      DATABASE_URL: Postgres.env.DATABASE_URL,
      PORT: "8000",
      AI_SERVICE_URL: aiServiceUrl,
      FRONTEND_URL: "https://${{web.RAILWAY_PUBLIC_DOMAIN}}",
      ...s3,
    },
  });

  const web = service("web", {
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    // Apply database migrations before the new version takes traffic.
    preDeploy: ["prisma migrate deploy"],
    healthcheck: "/login",
    healthcheckTimeout: 120,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "us-west2": 1 },
    env: {
      ENVIRONMENT: "production",
      NEXTAUTH_SECRET: preserve(),
      NEXTAUTH_URL: "https://${{web.RAILWAY_PUBLIC_DOMAIN}}",
      DATABASE_URL: Postgres.env.DATABASE_URL,
      PORT: "3000",
      AI_SERVICE_URL: aiServiceUrl,
      AI_INTERNAL_TOKEN: "${{ai.AI_INTERNAL_TOKEN}}",
      ENABLE_GCS_STORAGE: "false",
      ENABLE_CLOUD_TASKS: "false",
      ...s3,
    },
  });

  return project("study-buddy", {
    variables: { managed: true },
    resources: [ai, web, Postgres, postgresVolume, uploads],
  });
});
