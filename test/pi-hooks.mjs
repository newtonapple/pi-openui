let parent = "";
export async function initialize(data) {
	parent = data.parent;
}
export async function resolve(specifier, context, nextResolve) {
	try {
		return await nextResolve(specifier, context);
	} catch (e) {
		const bare = !specifier.startsWith(".") && !specifier.startsWith("/") && !specifier.startsWith("file:") && !specifier.startsWith("node:");
		if (e && e.code === "ERR_MODULE_NOT_FOUND" && bare && parent) return nextResolve(specifier, { ...context, parentURL: parent });
		throw e;
	}
}
