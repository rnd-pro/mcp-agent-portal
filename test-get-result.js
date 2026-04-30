const { spawn } = require('child_process');
import('node-fetch').then(fetch => {
  fetch.default('http://127.0.0.1:58637/api/health').then(r=>r.json()).then(console.log);
});
