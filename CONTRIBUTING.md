# Contributing Guide

Thank you for your interest in the x402b project! We welcome all forms of contributions.

## How to Contribute

### Reporting Issues

If you discover a bug or have a feature suggestion, please submit it via [GitHub Issues](https://github.com/Pieverse-Eng/x402b/issues).

When submitting an issue, please provide:
- A clear description of the problem
- Steps to reproduce (if possible)
- Expected behavior vs actual behavior
- Environment information (OS, Node.js version, etc.)

### Submitting Pull Requests

1. **Fork this repository**
2. **Create a feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit your changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to the branch** (`git push origin feature/AmazingFeature`)
5. **Submit a Pull Request**


### Commit Message Convention

Please follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation updates
- `style`: Code formatting (no code change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

**Example**:
```
feat(pieUSD): add transferWithAuthorization support

Implement EIP-3009 transferWithAuthorization to enable gasless payments on BNB Chain.

Closes #123
```

## Code Review

All Pull Requests must go through code review before being merged. Please ensure:
- All tests pass
- Code meets project standards
- Related documentation has been updated

Thank you for contributing!
