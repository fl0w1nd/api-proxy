// 服务静态文件
export const serveStaticFile = async (filePath: string, contentType: string): Promise<Response> => {
  try {
    const data = await Deno.readFile(`./static/${filePath}`);
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    return new Response("Not Found", { status: 404 });
  }
};
