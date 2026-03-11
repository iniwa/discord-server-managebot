import express from 'express';
import path from 'path';
import snapshotsRouter from './routes/snapshots';
import reactionRolesRouter from './routes/reactionRoles';
import voiceRolesRouter from './routes/voiceRoles';
import membersRouter from './routes/members';
import leaveLogsRouter from './routes/leaveLogs';
import discordRouter from './routes/discord';
import botLogsRouter from './routes/botLogs';
import nicknamesRouter from './routes/nicknames';
import statusRolesRouter from './routes/statusRoles';

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api/snapshots', snapshotsRouter);
  app.use('/api/reaction-roles', reactionRolesRouter);
  app.use('/api/voice-roles', voiceRolesRouter);
  app.use('/api/members', membersRouter);
  app.use('/api/leave-log', leaveLogsRouter);
  app.use('/api/discord', discordRouter);
  app.use('/api/bot-logs', botLogsRouter);
  app.use('/api/nicknames', nicknamesRouter);
  app.use('/api/status-roles', statusRolesRouter);

  return app;
}

export function startServer(port: number): void {
  const app = createApp();
  app.listen(port, () => {
    console.log(`[Web] Server listening on http://localhost:${port}`);
  });
}
