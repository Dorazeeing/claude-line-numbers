# claude-line-numbers

![version](https://img.shields.io/badge/version-0.2.0-blue)
![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.299%2B-d97757)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%2FWSL-lightgrey)
![license](https://img.shields.io/badge/license-MIT-green)

**Claude Code 답변에 VS Code 같은 줄번호를 붙여주는 모드예요.**
마우스로 드래그해서 복사해도 번호는 **절대 딸려오지 않고**, 번호를 클릭하면 그 줄을 질문에 바로 인용할 수 있어요.

> A Claude Code mod that adds a VS Code-style line-number gutter to Claude's replies. The numbers never end up in a mouse copy, and clicking one quotes that line into your prompt. [English ↓](#english)

```
❯ useEffect가 왜 두 번 실행돼?

●  1 │ 확인해볼게요.
  Read 1 file
●  2 │ 원인은 React의 StrictMode예요.
     │
   3 │ 개발 모드에서는 컴포넌트를 일부러 한 번 더 마운트해서,
     │ 정리(cleanup) 함수가 빠졌는지 확인해요.
   4 │ useEffect(() => {
   5 │   const id = setInterval(tick, 1000)
   6 │   return () => clearInterval(id)
   7 │ }, [])
```

---

## 왜 만들었나요?

Claude의 답변을 읽다가 이해 안 되는 부분이 생기면, 그 **위치**를 Claude에게 알려주기가 어려워요.
이 모드를 쓰면 "**5번 줄**이 이해가 안 돼"라고 말하거나, 번호를 클릭해서 그 줄을 그대로 인용하면 돼요.
그리고 Claude가 그 줄이 무엇인지 **정확히** 알게 돼요.

## 기능

| 기능 | 설명 |
| --- | --- |
| 🔢 **줄번호** | 답변마다 1부터 시작해요. 중간에 도구 호출이 끼어 있어도 그 답변 안에서는 번호가 이어져요. |
| ✂️ **복사에서 제외** | 드래그하면 `│` 오른쪽 본문만 복사돼요. 번호, `│`, 불릿, 들여쓰기 공백은 빠지고, 화면에서 접힌 긴 줄은 한 줄로 복사돼요. |
| 🖱️ **클릭해서 인용** | 번호를 클릭하면 프롬프트에 `> 5번 줄: …`이 들어가요. 그 아래에 질문만 쓰면 돼요. 예전 답변의 줄도 인용할 수 있어요. |
| 💬 **"N번 줄" 질문** | "5번 줄", "5~7번 줄", "라인 5", "line 5"처럼 쓰면, 모드가 직전 답변의 그 줄 원문과 앞뒤 줄을 Claude에게 같이 전달해요. |
| 🍎 **OS별 모양 유지** | 답변 불릿을 Claude Code와 똑같이 그려요. macOS에서는 `⏺`, 그 밖에서는 `●`이에요. |

## 설치

Claude Code 프롬프트에서:

```
/plugin install line-numbers --marketplace Dorazeeing/claude-line-numbers
```

`Add marketplace?`에서 `y`를 누르고 **user** scope를 고르면, 지금 세션부터 바로 적용돼요.

<details>
<summary>셸에서 설치, 업데이트, 삭제</summary>

```sh
# 설치
claude plugin install line-numbers --marketplace Dorazeeing/claude-line-numbers

# 업데이트 (그다음 Claude Code에서 /reload-plugins)
claude plugin update line-numbers@claude-line-numbers

# 삭제
claude plugin uninstall line-numbers@claude-line-numbers
```

</details>

### 요구 사항

- **Claude Code 2.1.299 이상.** 버전이 낮으면 모드가 로드되지 않아요. `claude update`로 먼저 업데이트하세요.
- **전체화면(fullscreen) 모드.** Claude Code의 기본값이에요. 다만 tmux 안에서는 꺼져 있어요. 줄번호가 안 보이면 `/tui fullscreen`을 실행하세요.
- macOS, Windows(PowerShell·cmd, Windows Terminal 권장), Linux·WSL에서 동작해요.

## 사용법

**1. 클릭해서 묻기 (추천)**

궁금한 줄의 번호를 클릭하고, 그 아래에 질문을 이어서 써요.

```
❯ > 5번 줄:   const id = setInterval(tick, 1000)
  이 id는 어디에 쓰여?
```

**2. 번호로 묻기**

```
❯ 5번 줄이 이해가 안 돼
❯ 4~7번 줄 다시 설명해줘
❯ 라인 3이랑 6 비교해줘
```

**3. 복사하기**

평소처럼 드래그하면 본문만 클립보드에 들어가요.

## 알아두면 좋은 것

- **그냥 드래그하세요.** Windows Terminal의 **Shift+드래그**나 macOS Terminal·iTerm2의 **Option+드래그**는 Claude Code가 아니라 터미널이 직접 선택하는 거라서, 번호까지 같이 복사돼요.
- 번호로 물을 때(2번 방법)는 **직전 답변**을 기준으로 찾아요. 더 예전 답변의 줄은 번호를 클릭해서 인용하세요.
- 빈 줄과 코드 블록의 ```` ``` ```` 줄에는 번호가 없어요. 표는 통째로 번호 하나예요.
- 터미널에서는 글자 크기를 바꿀 수 없어서, 번호를 작게 하는 대신 회색으로 표시해요.

<details>
<summary><b>문제 해결</b></summary>

**줄번호가 안 보여요**
- `claude --version`이 2.1.299 이상인지 확인하세요.
- 전체화면 모드인지 확인하세요 (`/tui fullscreen`). 일반 모드에서는 일부러 번호를 그리지 않고, 처음 한 번 안내 메시지를 띄워요.
- 설치 직후라면 `/reload-plugins`를 실행하세요. 이미 화면에 있던 답변은 예전 모양으로 남을 수 있고, 새 답변부터 적용돼요.

**번호가 같이 복사돼요**
- Shift+드래그나 Option+드래그를 쓰지 않았는지 확인하세요.

**Windows에서 WSL과 Windows용 Claude Code를 둘 다 써요**
- 둘은 설정 폴더가 따로라서, 양쪽에서 각각 설치해야 해요.

</details>

<details>
<summary><b>동작 방식</b></summary>

- **복사에서 빠지는 이유.** Claude Code의 전체화면 선택 기능은 엔진이 그리는 코드 블록의 줄번호 거터와, 그 왼쪽 영역을 복사에서 빼요. 이 모드는 답변 전체 아래에 그 거터를 잘라 만든 **마스크**를 깔고, 그 위에 `● 5 │`을 그려요. 그래서 보이는 거터 전체가 복사에서 빠져요. 번호는 마스크 위에 놓인 버튼이라, 복사에서는 빠지면서도 클릭은 돼요.
- **번호가 정확한 이유.** 답변은 원문 한 줄당 한 행으로 그려요. 그리고 대화에 행이 추가될 때마다(`session.append`), 각 텍스트 블록이 답변 안에서 몇 번째 줄부터 시작하는지 기억해요. 화면에 그릴 때도, "N번 줄"을 찾을 때도 같은 번호를 써요.
- **표가 깨지지 않는 이유.** Claude Code는 표를 터미널 전체 폭에 맞춰 그려요. 거터가 그만큼 폭을 차지하니, 그대로 두면 표가 넘쳐서 접혀요. 그래서 모드는 표만 남은 폭에 맞춰, Claude Code와 같은 규칙으로 다시 그려요.

</details>

## 개발

```sh
git clone https://github.com/Dorazeeing/claude-line-numbers.git
cd claude-line-numbers
claude plugin validate .   # 매니페스트와 훅 검사
claude plugin test .       # 테스트 실행
```

로컬 폴더를 바로 써보려면 `claude --plugin-dir .`로 실행하세요. 고친 뒤에는 `/reload-plugins`로 다시 불러와요.

## 라이선스

[MIT](LICENSE). 자유롭게 쓰고, 고치고, 배포해도 돼요. 단, 저작권 표시와 라이선스 문구는 남겨주세요.

---

<a id="english"></a>

## English

[한국어 ↑](#claude-line-numbers)

**A Claude Code mod that adds VS Code-style line numbers to Claude's replies.**
Numbers are **never copied** when you copy with a mouse drag, and clicking a number quotes that line straight into your question.

```
❯ Why does useEffect run twice?

●  1 │ Let me check.
  Read 1 file
●  2 │ The cause is React's StrictMode.
     │
   3 │ In development, it mounts each component one extra time on purpose
     │ to check that you didn't forget the cleanup function.
   4 │ useEffect(() => {
   5 │   const id = setInterval(tick, 1000)
   6 │   return () => clearInterval(id)
   7 │ }, [])
```

### Why I made this

When part of Claude's answer doesn't make sense, it's hard to tell Claude **where**.
With this mod you can say "**line 5** doesn't make sense", or click the number to quote that line as is.
Claude then knows **exactly** which line you mean.

### Features

| Feature | Description |
| --- | --- |
| 🔢 **Line numbers** | Each answer starts at 1. If tool calls come in between, the numbers keep counting within that answer. |
| ✂️ **Left out of copies** | Dragging copies only the text to the right of `│`. The number, the `│`, the bullet and the indentation are left out, and a long line that wraps on screen is copied as one line. |
| 🖱️ **Click to quote** | Clicking a number puts `> 5번 줄: …` (Korean for "line 5") into the prompt. Just write your question below it. Lines from older answers can be quoted too. |
| 💬 **"Line N" questions** | Write "line 5", "lines 5-7", "L5" (or the Korean "5번 줄", "라인 5"), and the mod passes Claude the original text of those lines from the previous answer, together with the lines around them. |
| 🍎 **OS-matched look** | Answer bullets are drawn exactly as Claude Code draws them: `⏺` on macOS, `●` everywhere else. |

### Install

In the Claude Code prompt:

```
/plugin install line-numbers --marketplace Dorazeeing/claude-line-numbers
```

Press `y` at `Add marketplace?` and pick **user** scope. It takes effect right away, from the current session.

<details>
<summary>Install, update and uninstall from the shell</summary>

```sh
# Install
claude plugin install line-numbers --marketplace Dorazeeing/claude-line-numbers

# Update (then run /reload-plugins in Claude Code)
claude plugin update line-numbers@claude-line-numbers

# Uninstall
claude plugin uninstall line-numbers@claude-line-numbers
```

</details>

#### Requirements

- **Claude Code 2.1.299 or later.** On an older version the mod won't load. Run `claude update` first.
- **Fullscreen mode.** This is Claude Code's default, but it is off inside tmux. If you don't see line numbers, run `/tui fullscreen`.
- Works on macOS, Windows (PowerShell and cmd; Windows Terminal recommended) and Linux/WSL.

### Usage

**1. Click to ask (recommended)**

Click the number of the line you're curious about, then write your question below it.

```
❯ > 5번 줄:   const id = setInterval(tick, 1000)
  Where is this id used?
```

**2. Ask by number**

```
❯ I don't understand line 5
❯ Explain lines 4-7 again
❯ Compare line 3 and line 6
```

**3. Copying**

Just drag as usual, and only the text goes to the clipboard.

### Good to know

- **Just drag.** **Shift+drag** in Windows Terminal and **Option+drag** in macOS Terminal and iTerm2 are the terminal selecting on its own, not Claude Code, so the numbers get copied too.
- When you ask by number (method 2), the mod looks in the **previous answer**. For a line from an older answer, click its number to quote it.
- Blank lines and the ```` ``` ```` lines of code blocks have no number. A table gets one number as a whole.
- A terminal can't change the font size, so instead of making the numbers small, they are shown in gray.

<details>
<summary><b>Troubleshooting</b></summary>

**I don't see line numbers**
- Check that `claude --version` is 2.1.299 or later.
- Check that you are in fullscreen mode (`/tui fullscreen`). In normal mode the mod deliberately draws no numbers and shows a notice once.
- If you just installed it, run `/reload-plugins`. Answers already on screen may keep their old look; new answers get the numbers.

**The numbers get copied**
- Check that you didn't use Shift+drag or Option+drag.

**On Windows, I use both WSL and the Windows build of Claude Code**
- They have separate config folders, so install the mod in each.

</details>

<details>
<summary><b>How it works</b></summary>

- **Why the numbers are left out of copies.** Claude Code's fullscreen selection leaves out the line-number gutter of the code blocks the engine draws, and everything to its left. The mod lays a **mask** under the whole answer, made by clipping such a gutter, and draws `● 5 │` over it. So the whole visible gutter is left out of copies. Each number is a button sitting on the mask, so it is left out of copies and is still clickable.
- **Why the numbers are accurate.** Answers are drawn one row per line of the original text. Each time a row is added to the conversation (`session.append`), the mod remembers which line of the answer each text block starts at. The same numbers are used when drawing the screen and when looking up "line N".
- **Why tables don't break.** Claude Code draws a table to fit the full width of the terminal. The gutter takes up part of that width, so left as is the table would overflow and wrap. So the mod redraws only the tables, fitted to the remaining width, by the same rules as Claude Code.

</details>

### Development

```sh
git clone https://github.com/Dorazeeing/claude-line-numbers.git
cd claude-line-numbers
claude plugin validate .   # check the manifest and hooks
claude plugin test .       # run the tests
```

To try the local folder directly, run `claude --plugin-dir .`. After editing, reload with `/reload-plugins`.

### License

[MIT](LICENSE). You are free to use, modify and distribute it. Just keep the copyright notice and the license text.
