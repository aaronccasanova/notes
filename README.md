# Notes

## Maintaining a private copy of this repository (with upstream sync)

This project recommends a workflow where you keep a **private copy** of the code while still pulling in updates from the public repository.

Unlike a traditional GitHub fork, this method:

- Lets your copy be **private**, even if the original is public.
- Keeps a connection to the original repository for easy updates.
- Requires you to manually configure remotes.

### 📋 Steps

1. **Clone the public repository locally**

   ```bash
   cd ~/notes
   git clone https://github.com/aaronccasanova/notes.git .
   ```

2. **Create a new private repository** on GitHub (leave it empty — no README, .gitignore, or license).

3. **Point `origin` to your private repository**

   ```bash
   git remote set-url origin https://github.com/<your-username>/notes.git
   ```

4. **Add the public repository as `upstream`**

   ```bash
   git remote add upstream https://github.com/aaronccasanova/notes.git
   ```

5. Make upstream read-only (prevent accidental pushes)

   ```bash
   git remote set-url --push upstream no_push
   ```

6. **Push your local copy to your private repo**

   ```bash
   git push -u origin main
   ```

7. **Pull in upstream changes anytime**

   ```bash
   git fetch upstream
   git merge upstream/main
   ```

   _(Or rebase instead of merge if preferred.)_

Done! Feel free to delete this section after setting up.

## Getting started

Install dependencies:

```bash
pnpm i
```

Run ingestion script:

```bash
node ~/notes/db/ingest.ts
```

Enable Notes MCP in your agent of choice:

```json
{
  "mcpServers": {
    "notes-mcp": {
      "command": "node",
      "args": ["mcp/server.ts"]
    }
  }
}
```
