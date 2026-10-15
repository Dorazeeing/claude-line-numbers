# claude-line-numbers

![version](https://img.shields.io/badge/version-0.2.0-blue)
![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.299%2B-d97757)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux%2FWSL-lightgrey)
![license](https://img.shields.io/badge/license-MIT-green)

**Claude Code 답변에 VS Code 같은 줄번호를 붙여주는 모드예요.**
마우스로 드래그해서 복사해도 번호는 **절대 딸려오지 않고**, 번호를 클릭하면 그 줄을 질문에 바로 인용할 수 있어요.

> A Claude Code mod that adds a VS Code-style line-number gutter to Claude's replies. The numbers never end up in a mouse copy, and clicking one quotes that line into your prompt. [English summary ↓](#english)

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

- **복사에서 빠지는 이유.** Claude Code의 전체화면 선택 기능은 엔진이 그리는 코드 블록의 줄번호 거터와, 그 왼쪽 영역을 복사에서 빼요. 이 모드는 답변의 거터 열 아래에 그 거터를 잘라서 **마스크**로 깔고, 그 위에 `● 5 │`을 그려요. 그래서 보이는 거터 전체가 복사에서 빠져요. 번호는 마스크 위에 놓인 버튼이라, 복사에서는 빠지면서도 클릭은 돼요.
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

**claude-line-numbers** adds a dim, VS Code-style line-number gutter to Claude Code replies.

- **Numbered per reply.** Each reply starts at 1 and keeps counting across tool calls.
- **Never copied.** A mouse drag copies the reply text only. The gutter sits on a mask that Claude Code's fullscreen selection leaves out.
- **Click to quote.** Clicking a number puts `> 5번 줄: <line>` into your prompt.
- **Ask by number.** Write "line 5", "lines 4-7", "5번 줄" or "라인 5", and the mod hands Claude the exact text of that line of its previous reply, with its neighbours.

**Install:** `/plugin install line-numbers --marketplace Dorazeeing/claude-line-numbers`

**Requires:** Claude Code 2.1.299+ and the fullscreen renderer (`/tui fullscreen`; it is off by default inside tmux). Drag plainly: Shift-drag (Windows Terminal) and Option-drag (macOS) are the terminal's own selection, and those do copy the numbers.

**License:** [MIT](LICENSE)
