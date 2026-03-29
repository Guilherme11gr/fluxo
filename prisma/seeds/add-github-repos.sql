-- Seed para adicionar github_repo_url aos projetos existentes
UPDATE public.projects 
SET github_repo_url = 'https://github.com/Guilherme11gr/jt-kill'
WHERE github_repo_url IS NULL;

-- Verificar se foi atualizado
SELECT id, name, github_repo_url FROM public.projects;
