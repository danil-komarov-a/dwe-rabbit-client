const amqplib = require('amqplib');
const EventEmitter = require('events');
const uuidv4 = require('uuid/v4');

class DweClient extends EventEmitter {
  constructor(config) {
    super();
    this.exchangeName = config.exchangeName;
    this.rpcQueueName = config.rpcQueueName;
    this.connectionConfig = config.connectionConfig;
    this.ttl = config.ttl;

    this.responseListeners = [];
  }

  async connect() {
    try {
      this.connection = await amqplib.connect(this.connectionConfig);
    } catch (e) {
      console.log(e);
      setTimeout(() => this.connect(), 10000);
      return;
    }

    this.connection.once('error', (err) => {
      console.log(err);
      setTimeout(() => this.connect(), 10000);
    });

    this.channel = await this.connection.createChannel();

    let assertResult = await this.channel.assertQueue('', { exclusive: true });
    this.replyQueueName = assertResult.queue;

    await this.channel.assertExchange(this.exchangeName, 'fanout', { durable: false });
    assertResult = await this.channel.assertQueue('', { exclusive: true });
    this.eventsQueueName = assertResult.queue;
    this.channel.bindQueue(this.eventsQueueName, this.exchangeName, '');

    this.channel.consume(this.eventsQueueName, msg => this.onMessage(msg), { noAck: true });
    this.channel.consume(this.replyQueueName, msg => this.onResponse(msg), { noAck: true });
  }

  addResponseListener(id, resolve, reject) {
    this.responseListeners = [
      ...this.responseListeners,
      {
        id,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.responseListeners = this.responseListeners.filter(r => r.id !== id);
          reject(new Error('Response timeout'));
        }, this.ttl),
      },
    ];
  }

  async call(req) {
    const corrId = uuidv4();
    const stringifyed = JSON.stringify(req);

    return new Promise(async (resolve, reject) => {
      await this.channel.sendToQueue(this.rpcQueueName, Buffer.from(stringifyed), {
        correlationId: corrId, replyTo: this.replyQueueName, expiration: this.ttl,
      });
      this.addResponseListener(corrId, resolve, reject);
    });
  }

  onResponse(msg) {
    const id = msg.properties.correlationId;
    const response = this.responseListeners.find(r => r.id === id);

    if (!response) {
      return;
    }

    const data = JSON.parse(msg.content.toString());
    this.responseListeners = this.responseListeners.filter(r => r.id !== id);
    clearTimeout(response.timeout);
    response.resolve(data);
  }

  onMessage(msg) {
    try {
      const data = JSON.parse(msg.content.toString());
      this.emit(data.event, data.data);
    } catch (e) {
      console.log(e);
    }
  }

  eventSend(event, data) {
    const eventData = {
      event,
      data,
    };
    const stringifyed = JSON.stringify(eventData);
    return this.channel.publish(this.exchangeName, '', Buffer.from(stringifyed), { expiration: this.ttl });
  }

  async close() {
    if (this.connection) {
      await this.connection.close();
    }
  }
}

module.exports = DweClient;
