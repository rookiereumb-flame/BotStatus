const express = require('express');
const app = express();
const PORT = 5000;

const commands = [
  { name: '/kick', description: 'Kick a member from the server' },
  { name: '/ban', description: 'Ban a member from the server' },
  { name: '/mute', description: 'Timeout a member (temporary mute)' },
  { name: '/warn', description: 'Warn a member' },
  { name: '/unban', description: 'Unban a user from the server' },
  { name: '/unmute', description: 'Remove timeout from a member' }
];

app.get('/', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Discord Moderation Bot</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 16px;
          padding: 40px;
          max-width: 600px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
          color: #5865F2;
          margin-bottom: 10px;
          font-size: 32px;
        }
        .status {
          display: inline-block;
          padding: 8px 16px;
          background: #3BA55C;
          color: white;
          border-radius: 20px;
          font-weight: 600;
          margin-bottom: 30px;
          font-size: 14px;
        }
        h2 {
          color: #2c3e50;
          margin-top: 30px;
          margin-bottom: 20px;
          font-size: 20px;
          border-bottom: 2px solid #5865F2;
          padding-bottom: 10px;
        }
        .command-list {
          list-style: none;
        }
        .command-item {
          background: #f8f9fa;
          padding: 16px;
          border-radius: 8px;
          margin-bottom: 12px;
          transition: transform 0.2s, box-shadow 0.2s;
          border-left: 4px solid #5865F2;
        }
        .command-item:hover {
          transform: translateX(5px);
          box-shadow: 0 4px 12px rgba(88, 101, 242, 0.2);
        }
        .command-name {
          font-weight: 700;
          color: #5865F2;
          font-size: 16px;
          margin-bottom: 4px;
        }
        .command-desc {
          color: #6c757d;
          font-size: 14px;
        }
        .footer {
          margin-top: 30px;
          text-align: center;
          color: #95a5a6;
          font-size: 14px;
        }
        .emoji {
          margin-right: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1><span class="emoji">🤖</span>Discord Moderation Bot</h1>
        <span class="status">✅ Online & Running</span>
        
        <h2>Available Commands</h2>
        <ul class="command-list">
          ${commands.map(cmd => `
            <li class="command-item">
              <div class="command-name">${cmd.name}</div>
              <div class="command-desc">${cmd.description}</div>
            </li>
          `).join('')}
        </ul>
        
        <div class="footer">
          Bot is active and ready to moderate your server
        </div>
      </div>
    </body>
    </html>
  `;
  
  res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Bot status page available at http://0.0.0.0:${PORT}`);
});

module.exports = app;
