This bot is designed to check any github pull requests for changes to `package.json` dependencies and post the results in a comment. See [pull #1](https://github.com/cody-greene/dependency-bot/pull/1) as an example.

> xxxxxxx...yyyyyyy includes dependency changes!
>
> "package.json" *(2 modified, 1 added, 1 removed)*:
> ```
> + honeybee@^2.0.0 (from ^1.0.0)
> + bluebird@2.0.0
> - browserify@^1.0.0
> ```

## Setup
Copy `example.env` and fill in the appropriate values.

```bash
# create the bundle
node_modules/.bin/browserify --node --no-bundle-external --standalone wt src/index.js >webtask.js

# create the webtask using the auth0 wt-cli
wt create --no-merge --secrets-file .env --name dependency-bot webtask.js

# update the webtask
wt update dependency-bot webtask.js
```

Create a new webhook on your github repository with:
- Payload URL: `https://$CONTAINER.run.webtask.io/dependency-bot`
- Content Type: `application/json`
- Secret: `*****`
- Events: `pull_request`
