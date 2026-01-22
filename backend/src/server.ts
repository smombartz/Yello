import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => {
  return { status: 'ok' };
});

const port = parseInt(process.env.PORT || '3000');
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`Server running on port ${port}`);
});
