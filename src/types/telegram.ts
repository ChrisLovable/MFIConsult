export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TelegramVoice {
  duration?: number;
  mime_type?: string;
  file_id: string;
  file_unique_id: string;
  file_size?: number;
}

export interface TelegramAudio {
  duration?: number;
  mime_type?: string;
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}
