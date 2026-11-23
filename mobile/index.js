/**
 * @format
 */

import {AppRegistry} from 'react-native';
// Переводы подключаем первыми и ради побочного эффекта: Metro откладывает
// загрузку модулей до первого обращения (inline requires), а экраны, которые
// берут только useTranslation, к модулю переводов не обращаются — без этой
// строки они показывали бы ключи вместо текста.
import './src/i18n';
import App from './App';
import {name as appName} from './app.json';
import {installCrashGuard} from './src/net/crashGuard';
import {installBackgroundPush} from './src/net/pushBackground';

// Перехват ставим до запуска приложения: ошибка при старте тоже должна быть
// видна текстом, а не выглядеть как «приложение не открывается».
installCrashGuard();

// Обработчик фоновых push — до интерфейса: сообщение о входящем звонке может
// прийти и тогда, когда интерфейса нет вовсе (приложение выгружено).
installBackgroundPush();

AppRegistry.registerComponent(appName, () => App);
