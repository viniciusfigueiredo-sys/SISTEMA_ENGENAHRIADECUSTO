// Substitui o endpoint antigo; não consulta usuários nem executa ações.
Deno.serve(()=>new Response(JSON.stringify({erro:'Serviço antigo encerrado. Atualize o sistema.'}),{status:410,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'https://viniciussouzaf.github.io','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}}));
