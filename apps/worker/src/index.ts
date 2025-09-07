import { QUEUE, RedisClient } from '@exness/redisClient';

const client = new RedisClient();

async function main() {
    await client.connect();

    while (1) {
        const message = await client.xRead({ key: QUEUE.WORKER_QUEUE });
        console.log(message);
    }
}

main()