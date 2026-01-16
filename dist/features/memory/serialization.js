export function normalizeTags(tags) {
    return (tags || []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}
export function toSqliteJson(value) {
    if (value === undefined || value === null)
        return null;
    return JSON.stringify(value);
}
export function fromSqliteJson(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
export function toSqliteTags(tags) {
    if (!tags || tags.length === 0)
        return null;
    return JSON.stringify(tags);
}
export function fromSqliteTags(value) {
    if (!value)
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String) : [];
    }
    catch {
        return value.split(',').map((tag) => tag.trim()).filter(Boolean);
    }
}
//# sourceMappingURL=serialization.js.map