# FDDS Editor Webapp

Cet outil est une webapp d'édition séparée du site public. Il ne doit pas être placé dans le dépôt GitHub Pages du site cible, sauf décision explicite contraire.

## Rôle

L'éditeur se connecte au dépôt GitHub du site, lit les fichiers éditoriaux du dossier `content/`, permet de modifier les contenus, puis régénère les fichiers publics du site.

Il est prévu pour un site structuré comme la version `fdds_static_site_v3_7`, avec notamment :

```text
content/site.json
content/home.json
content/categories.json
content/articles/*.json
index.html
pages/*.html
data/articles.json
data/categories.json
data/search-index.json
assets/images/
```

## Utilisation

Ouvrir `index.html` dans un navigateur moderne.

Renseigner :

```text
Propriétaire GitHub
Nom du dépôt
Branche
Préfixe de dossier, si le site n'est pas à la racine
Token GitHub à permissions limitées
```

Puis cliquer sur `Charger le site depuis GitHub`.

## Fonctionnalités actuelles

Cette première version permet de :

- afficher l'arborescence du dépôt ;
- charger `content/site.json`, `content/home.json`, `content/categories.json` et `content/articles/*.json` ;
- modifier la page d'accueil ;
- créer, modifier ou supprimer un article ;
- modifier les catégories associées à un article ;
- créer, modifier ou supprimer une catégorie ;
- ajouter une image à publier dans `assets/images/` ;
- générer un backup éditorial JSON ;
- restaurer un backup éditorial JSON ;
- reconstruire les fichiers publics du site ;
- publier les modifications dans GitHub via l'API GitHub.

## Publication

La publication envoie sur GitHub :

```text
content/site.json
content/home.json
content/categories.json
content/articles/*.json
index.html
pages/*.html
data/articles.json
data/categories.json
data/search-index.json
data/images.json
build-summary-editor.json
assets/images/*, pour les images ajoutées depuis l'éditeur
```

Les anciens fichiers d'articles supprimés sont aussi retirés, dans la mesure où ils étaient présents au moment du chargement initial.

## Sauvegarde

Le backup actuel est un backup éditorial JSON. Il contient :

```text
site
home
categories
articles
images
```

Il ne s'agit pas encore d'un ZIP complet du dépôt. La restauration remet les contenus en mémoire dans l'éditeur. Il faut ensuite publier pour écrire ces contenus dans GitHub.

## Sécurité

Le token GitHub est stocké uniquement dans le navigateur si vous cliquez sur `Enregistrer localement`. Pour limiter les risques, utilisez un token à permissions fines, limité au dépôt du site.

## Limites de cette version

Cette version n'intègre pas encore TinyMCE. Le contenu HTML des articles et de l'accueil est édité dans une zone de texte avec aperçu.

Cette version ne génère pas encore un ZIP complet du dépôt. Elle gère un backup éditorial JSON.

Cette version ne gère pas encore la conversion automatique des images vers WebP. Il faut donc fournir des images déjà adaptées au web, de préférence en `.webp`.


## Note v0.2

La publication GitHub utilise maintenant un commit unique via l’API Git Database de GitHub. Cela évite les conflits 409 provoqués par l’envoi successif de nombreux fichiers avec l’API Contents, et limite les annulations de déploiements GitHub Pages liées à une rafale de commits.
