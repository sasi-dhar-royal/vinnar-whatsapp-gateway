# Vinnar WhatsApp Gateway Microservice (Render Companion)

This microservice runs 24/7 on Render (Free tier) to maintain an active WhatsApp Web session for **Vinnar Institute of Fashion Designing Attendance Portal**.

## Quick Deployment to Render.com (Free - Takes 2 Minutes)

1. **Create a new Repository** on GitHub (or use this folder in your repo):
   - You can push this `whatsapp-gateway-microservice` directory as its own GitHub repo (e.g. `vinnar-whatsapp-gateway`).

2. **Deploy on Render**:
   - Go to [dashboard.render.com](https://dashboard.render.com).
   - Click **New +** > **Web Service**.
   - Connect your `vinnar-whatsapp-gateway` GitHub repository.
   - Choose:
     - **Runtime:** `Node`
     - **Build Command:** `npm install`
     - **Start Command:** `node server.js`
     - **Plan Type:** `Free`
   - Click **Create Web Service**.

3. **Get Your Service URL**:
   - Render will give you a public URL like:
     `https://vinnar-whatsapp-gateway.onrender.com`

4. **Connect to Vinnar Admin Dashboard**:
   - In Vinnar Admin Portal, go to **Settings > WhatsApp Gateway**.
   - Paste your Render URL (`https://vinnar-whatsapp-gateway.onrender.com`) and click **Save**.
   - Scan the displayed QR Code with your institute's WhatsApp phone (*Settings > Linked Devices*).
   - Once connected, clicking **"1-Click Send All to Parents"** in Exam Results or Fees will automatically deliver all messages in the background!

