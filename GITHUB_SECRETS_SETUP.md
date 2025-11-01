# GitHub Secrets Setup - Copy & Paste Values

## ⚠️ VERIFY YOUR INSTANCE NAME FIRST!

Before adding CLOUD_SQL_CONNECTION_NAME, verify your instance name by running in Cloud Shell:

```bash
gcloud sql instances list
```

This will show all your instances. Look for the one you're using.

Then get the exact connection name:
```bash
gcloud sql instances describe YOUR_INSTANCE_NAME --format="value(connectionName)"
```

Replace `YOUR_INSTANCE_NAME` with the name shown in the list above.

---

## Quick Setup - Add These Secrets

Go to: **GitHub → Your Repo → Settings → Secrets and variables → Actions → New repository secret**

### 1. DATABASE_URL

**Name:** `DATABASE_URL`

**Value:**
```
postgresql://postgres:studybuddy@34.63.58.130:5432/studybuddy
```

### 2. CLOUD_SQL_CONNECTION_NAME

**Name:** `CLOUD_SQL_CONNECTION_NAME`

**Value:** (Get this from the command above)
```
sacred-highway-476816-a3:us-central1:YOUR_ACTUAL_INSTANCE_NAME
```

**⚠️ Replace `YOUR_ACTUAL_INSTANCE_NAME` with the real instance name from `gcloud sql instances list`**

---

## All Required Secrets Checklist

Make sure you have ALL of these secrets in GitHub:

- [ ] `GCP_PROJECT_ID` = `sacred-highway-476816-a3`
- [ ] `GCP_SA_KEY` = (Your service account JSON key)
- [ ] `DATABASE_URL` = `postgresql://postgres:studybuddy@34.63.58.130:5432/studybuddy`
- [ ] `CLOUD_SQL_CONNECTION_NAME` = `sacred-highway-476816-a3:us-central1:studybuddy-db`
- [ ] `OPENAI_API_KEY` = (Your OpenAI API key)
- [ ] `NEXTAUTH_SECRET` = (Generate with: `openssl rand -base64 32`)
- [ ] `NEXTAUTH_URL` = (Your deployed frontend URL, e.g., `https://studybuddy-frontend-xxx.run.app`)
- [ ] `AI_SERVICE_URL` = (Your deployed AI service URL, e.g., `https://studybuddy-ai-service-xxx.run.app`)
- [ ] `GCS_BUCKET_NAME` = (Your GCS bucket name)
- [ ] `LLM_PROVIDER` = `openai` (optional, defaults to openai)
- [ ] `OPENAI_MODEL` = `gpt-5` (optional, defaults to gpt-5)
- [ ] `OPENAI_MINI_MODEL` = `gpt-5-mini` (optional, defaults to gpt-5-mini)
- [ ] `OPENAI_EMBEDDING_MODEL` = `text-embedding-3-small` (optional, defaults to text-embedding-3-small)

---

## Verification

After adding the secrets, your next deployment should:
1. ✅ Connect to database via Cloud SQL Proxy
2. ✅ Run Prisma migrations successfully
3. ✅ Deploy both frontend and AI service

