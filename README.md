# MS 재무 캘린더

> GitHub Pages로 배포되는 개인 자산관리 PWA.
> 친구가 한 번 설치하면 이후 `git push` 한 번으로 자동 업데이트됩니다.

## 최초 배포 세팅 (네가 한 번만)

### 1. GitHub repo 생성
- GitHub.com → New repository
- 이름: 예) `finance-MS`
- Public (GitHub Pages 무료 조건) 또는 Private + Pro 이상 계정

### 2. 로컬 폴더를 repo에 연결
```bash
cd /Users/diding/Desktop/friends-finance/MS
git init
git add .
git commit -m "initial: friend2 finance calendar"
git branch -M main
git remote add origin https://github.com/<YOUR_ID>/<REPO_NAME>.git
git push -u origin main
```

### 3. GitHub Pages 활성화
1. Repo → Settings → Pages
2. Source: **GitHub Actions** 선택
3. Actions 탭에서 빌드 확인
4. 배포 URL: `https://<YOUR_ID>.github.io/<REPO_NAME>/`

### 4. 친구에게 전달
Chrome에서 URL 접속 → "앱 설치" → 끝.

## 업데이트

```bash
git add -A && git commit -m "update: ..." && git push
```

푸시만 하면 자동 빌드·배포. 친구 앱은 서비스워커가 자동 감지.

## 로컬 개발

```bash
npm install
npm run dev
npm run build
npm run preview
```

## 커스터마이징

`src/db.js` `PROFILE`, `src/schedule.js`, `src/lib/phase.js` 등.
상세: 루트의 `TEMPLATE_SPEC.md` 참고.

## 상세 가이드

GH 폴더의 `README.md`와 동일. 전체 배포 플로우·FAQ는 거기 참고.
