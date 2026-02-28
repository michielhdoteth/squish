# npm Transition Playbook

You cannot reliably erase historical published npm versions for mature packages. Use controlled transition instead.

## 1) Deprecate legacy versions

Example:

```bash
npm deprecate "squish-memory@<0.9.0" "Deprecated: migrated to universal MCP launch model. See https://squishplugin.dev"
```

## 2) Keep latest on launch-ready version

```bash
npm dist-tag add squish-memory@0.8.2 latest
```

## 3) Update README/package metadata before publish

- Open-core boundary
- Commercial remote positioning
- Sponsor links

## 4) Publish new version with updated messaging

```bash
npm publish
```

## 5) Verify metadata

```bash
npm view squish-memory version description homepage license
```
