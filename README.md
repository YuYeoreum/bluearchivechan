# 서코 334 부스맵

`YuYeoreum/bluearchivechan` GitHub Pages 배포용 사본입니다.

## 배포

1. 이 폴더의 내용 전체를 저장소 루트에 올립니다.
2. GitHub 저장소의 **Settings → Pages**로 이동합니다.
3. **Build and deployment → Source**를 **GitHub Actions**로 선택합니다.
4. `main` 브랜치에 푸시하면 자동으로 빌드·배포됩니다.

배포 주소: <https://yuyeoreum.github.io/bluearchivechan/>

## 로컬 확인

Node.js 22 이상이 필요합니다.

```bash
npm ci
npm run dev
```

정적 결과물 검증:

```bash
npm test
```

빌드 결과는 `out/` 폴더에 생성됩니다.
