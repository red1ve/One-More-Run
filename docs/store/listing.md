# Карточка игры в консоли Яндекс Игр

Готовые тексты для черновика игры в консоли разработчика. Копируйте содержимое блоков из рамок как есть.
Лимиты проверяет `npm run store:check` (правила Яндекса на 2026-10-05: название до 50 знаков, краткое описание
до 70, описание 100–1000, «как играть» 100–1000, SEO-описание 50–160, комментарий разработчика до 2048, тегов до 20).
Не меняйте строки с `###` и квадратными скобками: по ним скрипт находит поля.

Название игры одинаково в игре и в карточке на каждом языке: RU «Ещё забег», EN «One More Run» (заголовок
стартового экрана и вкладки браузера берутся из `src/localization/*.json`).

## RU (русский)

### [name] Название (до 50 знаков)

```
Ещё забег
```

### [short] Краткое описание (до 70 знаков)

```
Кот бежит по саду: широко — надёжно, узко — больше очков
```

### [description] Описание (100–1000 знаков)

```
Ещё забег — быстрая аркада про пушистого кота Лоафа, который мчится по садовой дорожке между живых изгородей. Уворачивайся от цветочных кашпо, кустов и качающихся горшков. На каждой развилке выбирай сам: широкий проход надёжнее, узкий приносит больше очков и растит множитель. Проскочил вплотную к стене — получи бонус. Собирай монеты и покупай коту новые окраски: рыжик, смокинг, сиам, пёстрый и другие. Каждый день у всех игроков один и тот же забег и три новых задания, а серия дней подряд приносит всё больше монет. Сад меняется от дня к закату и ночи со светлячками, а скорость растёт. Управление одним пальцем. Один забег — и захочется ещё один.
```

### [howto] Как играть (100–1000 знаков)

```
Касайся левой или правой половины экрана, чтобы кот бежал в ту сторону. На компьютере: A/D или стрелки, P или Esc — пауза, M — звук. Проходи между препятствиями: чем дольше бежишь, тем быстрее забег. На развилке широкий проход безопасный (+10 очков), узкий рискованный (+100 и больше). Несколько рискованных проходов подряд растят множитель очков, безопасный выбор его сбрасывает. Пройдёшь вплотную к стене — бонус «впритирку». Монеты тратятся в магазине на окраски кота. Раз в день доступны «Забег дня» с одинаковой трассой для всех и три задания, за них дают монеты. Врезался в препятствие — забег окончен: жми «Ещё раз» или вернись в меню.
```

### [seo] SEO-описание (50–160 знаков)

```
Ещё забег — аркада про кота в саду. Уворачивайся от препятствий, рискуй ради очков, собирай монеты и открывай окраски.
```

### [tags] Теги (до 20, через запятую)

```
кот, аркада, раннер, бесконечный бег, одной рукой, казуальная, рекорды, сад, уворачиваться, монеты, скины, ежедневные задания, милая игра, на реакцию
```

### [comment] Комментарий разработчика (до 2048 знаков, необязательно)

```
Версия 1.0. Игра на одну руку для телефона и компьютера, прогресс (рекорд, монеты, окраски, серия дней) сохраняется в облаке для вошедших игроков. Будем рады отзывам: что понравилось, какие окраски и задания хотите увидеть.
```

## EN (English)

### [name] Game name (up to 50 characters)

```
One More Run
```

### [short] Short description (up to 70 characters)

```
Guide a cat through a garden: wide is safe, narrow scores more
```

### [description] Description (100–1000 characters)

```
One More Run is a quick arcade runner about Loaf, a fluffy cat racing down a garden path between hedges. Dodge flower boxes, bushes and swaying pots. At every fork choose for yourself: the wide gap is safer, the narrow one pays more points and builds your multiplier. Squeeze past a wall for a close-call bonus. Collect coins and buy new cat skins: ginger, tuxedo, siamese, calico and more. Every day all players get the same run and three new quests, and a streak of days in a row pays more coins. The garden turns from day to dusk and a night full of fireflies while the speed keeps growing. One-finger controls. One run, and you will want one more.
```

### [howto] How to play (100–1000 characters)

```
Tap the left or right half of the screen to make the cat run that way. On a computer use A/D or the arrow keys, P or Esc to pause, M for sound. Slip between the obstacles: the longer you run, the faster it gets. At a fork the wide gap is safe (+10 points) and the narrow one is risky (+100 and more). Several risky passes in a row grow your score multiplier, a safe choice resets it. Pass close to a wall for a close-call bonus. Coins are spent in the shop on cat skins. Once a day you get the Daily Run, the same track for everyone, and three quests that pay coins. Hit an obstacle and the run is over: press More or go back to the menu.
```

### [seo] SEO description (50–160 characters)

```
One More Run is an arcade runner about a cat in a garden. Dodge obstacles, risk it for points, collect coins and unlock skins.
```

### [tags] Tags (up to 20, comma separated)

```
cat, arcade, runner, endless runner, one hand, casual, high score, garden, dodge, coins, skins, daily quests, cute, reflex
```

### [comment] Developer comment (up to 2048 characters, optional)

```
Version 1.0. A one-hand game for phones and computers. Progress (best score, coins, skins, day streak) is saved in the cloud for signed-in players. We would love feedback: what you liked, and which skins and quests you want next.
```

## Остальные поля черновика

Это не тексты, а настройки. Названия пунктов в консоли могут отличаться, ищите по смыслу.

| Поле | Что указать |
| --- | --- |
| Версия | `1.0.0` |
| Языки | русский и английский (оба полностью переведены, язык определяется автоматически) |
| Платформы | компьютер и мобильные (телевизор не отмечать: управление касанием и клавишами) |
| Ориентация | вертикальная (на телефоне поле узкое, на компьютере по центру) |
| Категории (не больше двух) | «Аркады» и «Казуальные» (если пунктов с такими названиями нет, возьмите ближайшие по смыслу) |
| Возрастной ограничение | 0+: в игре нет насилия, текстов для взрослых и платных покупок; ответьте на вопросы консоли честно |
| Облачные сохранения | включить (игра пишет прогресс через `player.setData`) |
| Монетизация | включить рекламу: межстраничную и видео за награду (кнопки «продолжить» и «×2 монеты» уже подписаны как реклама) |
| Таблица лидеров | создать числовую, по убыванию; техническое имя `one_more_run_score` |
| Иконка | 512×512, PNG: `docs/store/icon-512.png` (голова Loaf на фоне изгороди и песка, без надписей; собрана из картинок проекта скриптом `scripts/store-capture/art.js`) |
| Обложка | 800×470, PNG: `docs/store/cover-800x470-ru.png` для русского, `docs/store/cover-800x470-en.png` для английского (если консоль просит одну, загрузите русскую). Стена изгороди с двумя проходами «+10» и «+100», Loaf и название шрифтом игры; это не скриншот |
| Заглавная картинка (по желанию) | 1560×520, PNG или JPG: `docs/store/hero-1560x520.png` |
| Скриншоты | телефон: `docs/store/screenshots/<язык>-phone-*.jpg` (1080×1920), компьютер: `<язык>-desktop-*.jpg` (1920×1080); не меньше двух на платформу; файлы `*-extra-*` не геймплей, их по желанию |
| Видео | горизонтальное 16:9 обязательно: `release/video/<язык>-video-horizontal.mp4` (27 с, 1280×720); вертикальное по желанию |
| Архив | `release/one-more-run.zip` (собирается командой `npm run pack`) |
