# 多计时器 GitHub Pages 静态网页

这是一个纯静态网页项目，可以直接部署到 GitHub Pages，不需要 Node 服务、不需要构建步骤。

## 文件

- `index.html`：页面结构
- `styles.css`：手机优先样式
- `app.js`：计时器、倒计时提醒、语音控制逻辑
- `.nojekyll`：让 GitHub Pages 按普通静态文件发布

## 部署方式

为了不影响你之前已经挂载过的网页，建议新建一个独立仓库，例如：

```text
multi-timer-github-pages
```

然后把这个文件夹里的文件上传到该仓库根目录。

在 GitHub 仓库里进入：

```text
Settings -> Pages -> Build and deployment
```

设置：

```text
Source: Deploy from a branch
Branch: main
Folder: / (root)
```

发布后地址通常是：

```text
https://你的用户名.github.io/multi-timer-github-pages/
```

这个方式是项目页，不会覆盖 `你的用户名.github.io` 这种个人主页仓库。

## 注意

语音识别依赖浏览器支持和麦克风权限。手机端建议优先使用 Chrome 或 Edge。
