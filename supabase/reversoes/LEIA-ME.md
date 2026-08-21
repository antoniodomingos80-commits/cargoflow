# Guiões de reversão

Ficheiros para desfazer uma migração já aplicada. **Não são migrações** e não
podem viver em `supabase/migrations/`: qualquer ferramenta que aplique a pasta
por ordem alfabética correria a reversão logo a seguir à migração e desfaria o
trabalho no mesmo instante.

Foi exactamente o que aconteceu a 21/08/2026. `REVERSAO_20260822_hardening_pg_temp.sql`
ficou por engano dentro de `migrations/`, e a reconstrução seguinte aplicou-a:
a base saiu com 0 de 56 funções endurecidas em vez de 55. O teste de
reconstrução não deu erro nenhum — a reversão é SQL válido.

Correr um destes ficheiros é sempre um acto manual e deliberado:

    psql "$DATABASE_URL" -f supabase/reversoes/<ficheiro>
