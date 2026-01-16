export function createDatabaseClient(db) {
    const isSqlite = typeof db.$client.prepare === 'function';
    return {
        $client: db.$client,
        $clientType: isSqlite ? 'sqlite' : 'postgres',
        select: (...args) => db.select(...args),
        insert: (...args) => db.insert(...args),
    };
}
//# sourceMappingURL=database.js.map