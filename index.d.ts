interface ConnectionConfig {
  hostname: string,
  port: string | number,
  username: string,
  password: string
}

interface Config {
  exchangeName: string,
  rpcQueueName: string,
  connectionConfig: ConnectionConfig,
  ttl: number
}

interface Request {
  method: string;
  params?: any[];
}

interface Response {
  id: string;
  result?: any;
  error?: any;
}

type Event =
  | 'orderCreate'
  | 'orderClose'
  | 'orderCancel'
  | 'orderError'
  | 'taskCreate'
  | 'taskClose'
  | 'taskError';

interface EventData {
  event: Event;
  data?: any;
}

declare class DweClient {
  constructor(config: Config);
  connect(): Promise<void>;
  call(req: Request): Promise<Response>;
  on(event: Event, fn: (data: any) => void): void;
  close(): Promise<void>;
  eventSend(event: Event, data: any): boolean;
}

export = DweClient;