import { app } from './app.js';
import { db } from './db.js';
import { createServer } from 'node:http';
const server = createServer(app);
import { installSockets } from './sockets.js';
installSockets(server);
const port = Number(process.env.PORT || 5003);
server.listen(port, () => console.log('flowdesk API on ' + port));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    }),
  );
