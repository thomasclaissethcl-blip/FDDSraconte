# FDDS Editor Webapp v0.3

Cette webapp est un outil d’édition séparé du site public. Elle se lance localement dans un navigateur, avec Live Server, puis se connecte au dépôt GitHub du site cible.

## Prérequis

Le dépôt GitHub du site doit contenir la structure générée à partir de `fdds_static_site_v3_7` ou d’une version ultérieure compatible :

```text
content/
index.html
pages/
data/
assets/
tools/
```

L’éditeur ne doit pas être ajouté au dépôt du site public. Il reste dans un dossier séparé.

## Utilisation

Ouvrez ce dossier dans VS Code, puis lancez Live Server sur `index.html`.

Renseignez ensuite :

```text
Owner
Repository
Branch
Préfixe éventuel
Token GitHub
```

Le token GitHub doit être limité au dépôt cible et disposer au minimum de la permission `Contents: Read and write`.

## Nouveautés de la v0.3

- Éditeur riche intégré pour la page d’accueil et le corps des articles.
- Possibilité de basculer vers le HTML source pour les corrections fines.
- Sélecteur d’images existantes pour les articles et les catégories.
- Insertion d’images depuis l’éditeur riche.
- Backup ZIP complet du dépôt chargé.
- Restauration ZIP complète vers GitHub en un seul commit.
- Conservation des catégories déclarées même si aucun article ne leur est encore associé.

## Points de prudence

La restauration ZIP remplace l’état du dépôt par le contenu de l’archive sélectionnée. Utilisez cette fonction d’abord sur un dépôt de test.

Le backup JSON reste utile pour sauvegarder rapidement les contenus éditoriaux. Le backup ZIP est plus large : il inclut tous les fichiers visibles dans l’arborescence chargée.

L’éditeur riche utilise les capacités natives du navigateur. Pour des corrections avancées, ouvrez le HTML source sous le bloc d’édition.
