1. 结合main分支的最新的tag，撰写当前分支的release note，并写入到CHANGELOG.md文件中，并在CHANGELOG.md文件中添加一个新的section，标题为最新分支 + 1的tag版本号。
2. 优化CHANGELOG.md文件的格式，确保符合Keep a Changelog规范。
3. 把本次更新的内容，添加到一个单独的文件中，文件名格式为`release_note_lastest.txt`，尽量简短，作为更新用户查看的信息
4. 也请你基于.github/PULL_REQUEST_TEMPLATE.md文件，撰写本次更新的Pull Request模板，确保符合项目的规范。新的模版，请写到.github/PULL_REQUEST_TEMPLATE_Demo.md 中