interface TelegramWebApp { ready():void; expand():void; setHeaderColor?(color:string):void; setBackgroundColor?(color:string):void }
declare global { interface Window { Telegram?:{WebApp?:TelegramWebApp} } }
export const initTelegram=()=>{const app=window.Telegram?.WebApp;if(!app)return;app.ready();app.expand();app.setHeaderColor?.('#eee9df');app.setBackgroundColor?.('#eee9df')};
