# claude-line-numbers

A Claude Code mod that puts a VS Code-style line-number gutter beside Claude's replies. The numbers are never copied by a mouse drag.

Claude Code 답변 왼쪽에 VS Code처럼 회색 줄번호를 붙여주는 모드예요. 마우스로 드래그해서 복사할 때 줄번호는 **절대 딸려오지 않아요**.

```
●  1 │ 제목
   2 │ 첫 번째 문단입니다. 이건 꽤 긴 문장이라서 터미널 폭을 넘어가면
     │ 이렇게 이어서 줄바꿈돼요.
     │
   3 │ - 항목 하나
   4 │ const add = (a, b) => a + b
```

- 번호는 **답변마다 1부터** 시작해요. 한 답변 안에 도구 호출이 끼어 있어도 번호가 이어져요.
- 드래그하면 `│` 오른쪽의 본문만 복사돼요. 번호, `│`, 불릿, 들여쓰기 공백은 빠지고, 줄바꿈된 긴 줄은 한 줄로 복사돼요.
- 질문에 "**14번 줄**이 이해가 안 돼", "5~7번 줄", "line 14"처럼 쓰면, 모드가 직전 답변의 그 줄 원문을 Claude에게 같이 전달해요.

## 설치

Claude Code 터미널 세션의 프롬프트에서:

```
/plugin install line-numbers --marketplace Dorazeeing/claude-line-numbers
```

`Add marketplace?`에서 `y`를 누른 뒤 user scope를 고르면, 그 세션부터 바로 적용돼요.

셸에서 설치하려면:

```
claude plugin install line-numbers --marketplace Dorazeeing/claude-line-numbers
```

업데이트는 `claude plugin update line-numbers@claude-line-numbers`로 해요.

## 요구 사항

- **Claude Code 2.1.299 이상**: 버전이 낮으면 모드가 로드되지 않아요. 먼저 `claude update`를 실행하세요.
- **전체화면(fullscreen) 렌더러**: 기본값이에요. 다만 tmux 안에서는 꺼져 있으니 `/tui fullscreen`으로 켜세요. 일반 모드에서는 터미널이 화면 글자를 전부 복사하기 때문에, 그 모드에서는 일부러 줄번호를 그리지 않아요.
- macOS, Windows(PowerShell/cmd, Windows Terminal 권장), Linux/WSL에서 사용할 수 있어요. Windows에서 WSL과 Windows용 Claude Code를 둘 다 쓴다면, 설정 폴더가 따로라서 양쪽에 각각 설치해야 해요.

## 주의

- 그냥 드래그하세요. **Shift+드래그**(Windows Terminal)나 **Option+드래그**(macOS Terminal/iTerm2)는 터미널 자체 선택이라서 줄번호까지 복사돼요.
- 표는 통째로 번호 하나, 코드 블록은 코드 줄마다 번호가 붙어요. 빈 줄과 코드 펜스 줄에는 번호가 없어요.
- 표는 줄번호 오른쪽에 남은 폭에 맞춰 모드가 직접 그려요. 열 너비 배분, 셀 안 줄바꿈, 굵게·코드 같은 서식은 Claude Code와 같은 규칙을 따르고, 폭이 너무 좁으면 Claude Code처럼 `머리글: 값` 형태로 세로로 풀어 보여줘요.
- 터미널은 글자 크기를 바꿀 수 없어서 첨자 대신 회색으로 표시해요.

## 동작 방식

Claude Code의 전체화면 선택 기능은 엔진이 그리는 `Code` 줄번호 거터와 그 왼쪽 영역을 복사에서 빼요. 이 모드는 각 행의 거터 아래에 잘라낸 `Code` 거터를 마스크로 깔고, 그 위에 `● 14 │`을 그려요. 그래서 보이는 거터 전체가 선택에서 빠져요. 답변은 원문 한 줄당 한 행으로 그리기 때문에, 화면의 번호와 "N번 줄" 조회 결과가 항상 일치해요.

Claude Code는 표를 터미널 전체 폭에 맞춰 그리기 때문에, 거터 옆에 두면 표의 매 줄이 넘쳐서 접혀요. 그래서 모드는 표를 거터 오른쪽 폭에 맞춰 직접 배치하고, 표가 차지하는 행 수만큼 정확히 마스크와 `│`를 깔아요. 마스크가 행보다 짧으면 그 아래로 마스크 자체의 줄번호(`100018` 같은 숫자)가 비쳐 보이기 때문이에요.

## 개발

```
claude plugin validate .
claude plugin test .
```
