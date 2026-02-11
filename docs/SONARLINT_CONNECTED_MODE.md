# SonarLint Connected Mode (Optional)

This repository intentionally **does not force SonarLint Connected Mode** via repo settings.

Reason: Connected Mode depends on **local IDE state** (your SonarCloud login/token and a local connection id). If a repo forces it, it can become noisy and “break” for other machines.

If you want Connected Mode, configure it **locally**:

## VS Code (SonarLint)

1. Install the **SonarLint** extension.
2. Open the SonarLint view → **Connected Mode**.
3. **Add connection → SonarCloud**.
4. Create a token in SonarCloud: **My Account → Security → Generate token**.
5. Bind your project:
   - Organization key: `shiloren`
   - Project key: `Shiloren_Gred-In-Compression-System`

That’s it. If you rotate tokens later, you only need to update the token in your local SonarLint connection.
