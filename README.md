# FDDS Éditeur

FDDS Éditeur est une interface web locale conçue pour administrer le site statique **Flash Dog Duke Silver présente…** sans modifier directement les fichiers HTML à la main.

L’outil sert de chaîne éditoriale légère. Il se connecte au dépôt GitHub du site, lit les contenus structurés, permet de modifier les articles, les catégories, les images et certains textes de la page d’accueil, puis régénère les fichiers publics du site avant de les publier dans un commit GitHub unique.

L’éditeur est séparé du site public. Il ne doit pas être intégré dans le dépôt publié sur GitHub Pages comme une page du site. Il sert uniquement à produire et publier les fichiers du site cible.

## Principe général

Le site public repose sur deux niveaux de fichiers.

Les fichiers éditoriaux sont ceux que l’on modifie en priorité. Ils se trouvent dans le dossier `content/` du dépôt cible. Ils décrivent la page d’accueil, les catégories et les articles.

Les fichiers publics sont ceux que le visiteur consulte. Ils sont générés automatiquement à partir des fichiers éditoriaux. Ils comprennent notamment `index.html`, les pages du dossier `pages/`, les fichiers du dossier `data/` et les ressources du dossier `assets/`.

L’éditeur évite donc de modifier directement les pages finales. Le principe attendu est le suivant :

1. charger le dépôt GitHub du site ;
2. modifier les contenus depuis l’interface ;
3. enregistrer les changements en mémoire ;
4. prévisualiser la génération ;
5. publier sur GitHub ;
6. vérifier le site public.

## Ce que l’outil permet de faire

L’éditeur permet de gérer les contenus suivants :

- la page d’accueil ;
- les articles généraux ;
- les articles de type personnage ;
- les cartes de personnage ;
- les catégories ;
- les images ;
- les liens internes ou externes ;
- les sauvegardes éditoriales ;
- les sauvegardes complètes du dépôt ;
- la publication vers GitHub.

Il permet aussi de consulter l’arborescence du dépôt et le journal technique des opérations réalisées.

## Ce que l’outil ne fait pas

L’éditeur n’est pas un CMS hébergé avec une base de données. Il ne stocke pas les contenus dans un serveur séparé.

Il ne remplace pas GitHub. Les modifications sont publiées dans le dépôt cible, puis GitHub Pages se charge de publier la nouvelle version du site.

Il ne protège pas automatiquement contre toutes les erreurs éditoriales. Avant une modification importante, il faut télécharger une sauvegarde.

## Prérequis

Pour utiliser l’éditeur, il faut disposer :

- d’un dépôt GitHub contenant le site cible ;
- d’une branche de publication, généralement `main` ;
- d’un token GitHub ayant le droit de lire et d’écrire dans ce dépôt ;
- d’un navigateur récent ;
- d’un moyen d’ouvrir l’éditeur localement, par exemple avec l’extension Live Server de VS Code.

Le token GitHub doit être limité au dépôt concerné. Il n’est pas nécessaire de lui donner accès à tous les dépôts du compte.

## Lancer l’éditeur

Ouvrez le dossier de l’éditeur dans VS Code.

Ouvrez ensuite le fichier :

```text
index.html
```

Lancez Live Server sur ce fichier. L’éditeur s’ouvre alors dans le navigateur.

L’ouverture directe du fichier par double-clic peut fonctionner partiellement, mais elle est moins fiable. Il vaut mieux utiliser Live Server, car l’éditeur effectue des lectures, des chargements et des échanges avec GitHub.

## Connecter l’éditeur au dépôt GitHub

Dans la section **Dépôt GitHub du site**, renseignez les champs suivants.

Le champ **Propriétaire ou organisation GitHub** correspond au nom du compte ou de l’organisation qui possède le dépôt.

Le champ **Nom du dépôt** correspond au nom exact du dépôt du site.

Le champ **Branche** indique la branche dans laquelle l’éditeur doit lire et publier les fichiers. Dans la plupart des cas, il s’agit de `main`.

Le champ **Préfixe de dossier** doit rester vide si le site est à la racine du dépôt. Il ne doit être rempli que si le site est placé dans un sous-dossier précis.

Le champ **Token GitHub à permissions limitées** reçoit le token personnel utilisé pour accéder au dépôt. Ce token ne doit pas être partagé, publié, copié dans le dépôt ou envoyé dans une conversation.

Après avoir renseigné ces champs, cliquez sur **Charger le site depuis GitHub**.

Lorsque le chargement fonctionne, le statut passe en mode connecté, l’arborescence devient disponible, les articles apparaissent dans la section Articles, et les catégories apparaissent dans la section Catégories.

## Enregistrer la configuration locale

Le bouton **Enregistrer localement** permet de mémoriser les informations de connexion dans le navigateur utilisé.

Cette option est pratique sur un ordinateur personnel. Elle est déconseillée sur une machine partagée.

Le bouton **Recharger la configuration** recharge les informations déjà enregistrées.

Le bouton **Effacer la configuration locale** supprime ces informations du navigateur.

## Utiliser les aides contextuelles

Certains champs et certains boutons disposent d’une aide contextuelle accessible avec une petite icône `?`.

Cliquez sur cette icône pour afficher une bulle d’explication. La bulle apparaît au-dessus de l’interface, sans déplacer les autres éléments de la page.

La bulle se ferme en cliquant sur la croix, en cliquant en dehors de la bulle, ou avec la touche `Échap`.

Ces aides servent à rappeler la fonction d’un champ ou d’un bouton au moment où l’on en a besoin. Elles ne remplacent pas les procédures détaillées du présent document.

## Consulter l’arborescence

L’onglet **Arborescence** affiche les fichiers repérés dans le dépôt chargé.

Cette vue sert à vérifier que l’éditeur travaille bien sur le bon dépôt, la bonne branche et le bon dossier.

Le bouton **Rafraîchir** relit l’arborescence depuis GitHub.

Cette section est utile après une publication, une restauration ou une modification manuelle faite directement dans GitHub.

## Modifier la page d’accueil

L’onglet **Accueil** permet de modifier les éléments éditoriaux principaux de la page d’accueil.

On peut y modifier les titres des sections, le texte d’introduction des catégories, le libellé de recherche, le texte affiché dans le champ de recherche, le libellé du bouton de réinitialisation, ainsi que le bloc de présentation.

Le bloc de présentation utilise un éditeur enrichi. Il permet d’ajouter des titres, du gras, de l’italique, des listes, des liens et des images.

Le panneau **Afficher le HTML source de la présentation** permet de voir ou corriger le code HTML produit. Cette zone est utile pour une correction fine, mais il faut éviter de l’utiliser pour des modifications ordinaires si l’éditeur enrichi suffit.

La prévisualisation située en bas de section permet de vérifier le rendu avant publication.

## Créer ou modifier un article

L’onglet **Articles** comporte deux zones.

La colonne de gauche liste les articles existants. Le champ de recherche permet de filtrer cette liste.

La zone de droite affiche le formulaire de l’article sélectionné.

Pour modifier un article existant, sélectionnez-le dans la liste. Les champs se remplissent automatiquement avec les données de l’article.

Pour créer un article, cliquez sur **Créer**. Un nouvel article est préparé en mémoire. Il faut ensuite renseigner au minimum le titre, le slug, le résumé, les catégories et le corps de l’article.

Le bouton **Enregistrer en mémoire** valide les changements dans l’état courant de l’éditeur. Il ne publie pas encore sur GitHub.

Le bouton **Supprimer en mémoire** retire l’article de l’état courant de l’éditeur. La suppression n’est envoyée à GitHub qu’au moment de la publication.

## Renseigner les champs d’un article

Le champ **Titre** correspond au titre affiché dans l’article et dans la carte d’article.

Le champ **Slug** correspond à l’identifiant utilisé dans les routes et les fichiers. Il doit rester court, lisible et stable. Un slug typique ressemble à `vega`, `machins` ou `jacques-homme-dore`.

Le champ **Image principale** indique l’image utilisée pour la carte d’article, avec un chemin du type :

```text
assets/images/nom-de-l-image.webp
```

Le champ **Choisir une image existante** permet de sélectionner une image déjà repérée dans le dépôt.

Le champ **Résumé de carte** correspond au court texte affiché dans la carte de l’article sur la page d’accueil.

Le champ **Type d’article** permet de choisir entre un article général et un article personnage.

Les cases de catégories déterminent les filtres dans lesquels l’article apparaîtra sur la page d’accueil du site.

## Modifier le corps d’un article

Le corps de l’article se modifie dans l’éditeur enrichi.

L’éditeur permet de créer des paragraphes, des titres de niveau 2 ou 3, des citations, des listes, des liens et des images.

Pour créer un lien, sélectionnez le texte à rendre cliquable, puis cliquez sur **Lien**. Une fenêtre permet de renseigner la cible du lien.

Pour un lien interne vers un article du site, utilisez une route de ce type :

```text
#/vega
```

Pour un lien externe, utilisez une URL complète, par exemple :

```text
https://exemple.com
```

Le panneau **Afficher le HTML source de l’article** permet de contrôler le code HTML du corps d’article. Il doit être utilisé avec prudence, car une erreur dans le HTML peut altérer le rendu public.

## Créer un article personnage

Un article personnage est un article général auquel on ajoute une carte de personnage structurée.

Pour créer ce type d’article, sélectionnez **Article personnage** dans le champ **Type d’article**, ou cochez **Créer une carte personnage**.

La zone **Carte de personnage** apparaît alors. Elle permet de renseigner une carte standardisée, cohérente avec le style du site.

La carte de personnage comprend :

- une image ;
- un texte alternatif ;
- une légende ;
- un type ;
- une activité ;
- un entourage ;
- un champ « Ennemi de » ;
- une première apparition ;
- un état.

Les champs textuels de la carte peuvent contenir des liens. Pour créer un lien dans l’un de ces champs, sélectionnez le texte concerné, puis cliquez sur **Créer un lien sur la sélection**.

Le bouton **Retirer le lien** supprime le lien appliqué à la sélection courante.

Lorsque l’article est généré, la carte est placée automatiquement au bon endroit dans la page publique.

## Modifier les catégories

L’onglet **Catégories** permet de créer, modifier ou supprimer les catégories utilisées par le site.

La colonne de gauche liste les catégories existantes.

Le bouton **Créer** prépare une nouvelle catégorie.

Le champ **Nom affiché** correspond au nom visible par le visiteur.

Le champ **Slug** correspond à l’identifiant technique utilisé pour les routes et les filtres. Il doit être stable. Modifier le slug d’une catégorie existante peut avoir un effet sur les articles qui l’utilisent.

Le champ **Image** indique l’image de la carte de catégorie.

Le champ **Choisir une image existante** permet de sélectionner une image déjà disponible dans le dépôt.

Le champ **Description** correspond au texte affiché dans la carte de catégorie.

Après modification, cliquez sur **Enregistrer en mémoire**. Les changements ne seront publiés sur GitHub qu’au moment de la publication.

## Ajouter des images

L’onglet **Images** permet de préparer des images à publier dans le dossier `assets/images/` du site cible.

Sélectionnez d’abord un fichier image depuis votre ordinateur.

Renseignez ensuite le **Nom de fichier cible**. Il est recommandé d’utiliser un nom court, sans espace, sans accent et avec une extension claire, par exemple :

```text
portrait-vega.webp
```

Cliquez ensuite sur **Ajouter à la file de publication**.

L’image apparaît alors dans les images en attente. Elle sera envoyée sur GitHub lors de la publication.

La section **Images déjà repérées** affiche les images que l’éditeur a trouvées dans le dépôt chargé.

## Sauvegarder le site

L’onglet **Sauvegarde** propose deux types de sauvegarde.

Le **backup JSON** sauvegarde les contenus éditoriaux gérés par l’éditeur. Il contient notamment les données de la page d’accueil, les articles, les catégories et les images repérées. Il est léger et utile pour sécuriser une session d’édition.

Le **backup ZIP complet** sauvegarde tous les fichiers visibles dans la branche chargée du dépôt. Il est plus complet et plus adapté avant une modification importante.

Il est recommandé de télécharger un backup ZIP complet avant une série importante de modifications.

## Restaurer une sauvegarde

La restauration JSON recharge les contenus éditoriaux dans l’éditeur. Après restauration, il faut publier pour envoyer ces contenus vers GitHub.

La restauration ZIP est plus lourde. Elle remplace l’état du dépôt par le contenu de l’archive sélectionnée.

Avant d’utiliser une restauration ZIP, vérifiez que l’archive correspond bien au site cible et non à un autre projet.

Après restauration, contrôlez le dépôt GitHub, puis vérifiez le site publié.

## Prévisualiser la génération

L’onglet **Publication** contient le bouton **Prévisualiser la génération**.

Ce bouton ne publie rien. Il indique quels fichiers seraient générés à partir des contenus actuellement chargés dans l’éditeur.

Cette étape permet de vérifier que les articles, les catégories, les pages, les données de recherche et les fichiers publics seront bien produits.

## Publier sur GitHub

Le bouton **Publier sur GitHub** génère les fichiers publics du site, prépare les fichiers éditoriaux, ajoute les images en attente, puis envoie l’ensemble vers GitHub dans un commit unique.

La publication met notamment à jour :

```text
content/
index.html
pages/*.html
data/articles.json
data/categories.json
data/search-index.json
assets/images/
```

Après publication, GitHub Pages peut mettre quelques instants à afficher la nouvelle version du site public.

Si le navigateur affiche encore l’ancienne version, rechargez la page avec un rafraîchissement forcé, ou ajoutez temporairement un paramètre à l’URL du site.

## Comprendre le journal

La section **Journal** affiche les opérations réalisées par l’éditeur.

Elle permet de vérifier le chargement du dépôt, la préparation des fichiers, la publication, les sauvegardes et les erreurs éventuelles.

Le bouton **Effacer** vide uniquement l’affichage du journal. Il ne supprime aucune donnée du site.

## En cas d’erreur GitHub 409

Une erreur `409` signifie généralement que la branche GitHub a changé entre le moment du chargement et le moment de la publication.

Dans ce cas, rechargez le site depuis GitHub, vérifiez que vos changements sont toujours présents ou restaurez votre backup JSON si nécessaire, puis relancez la publication.

Ce type d’erreur peut apparaître si plusieurs publications sont faites presque en même temps, ou si un fichier a été modifié directement dans GitHub pendant que l’éditeur était ouvert.

## Conseils de travail

Avant une modification importante, téléchargez un backup ZIP complet.

Pour une petite modification éditoriale, un backup JSON peut suffire.

Après chaque publication importante, vérifiez le dépôt GitHub et le site public.

Évitez de modifier manuellement les fichiers générés si vous comptez continuer à utiliser l’éditeur. Les fichiers à privilégier sont ceux du dossier `content/`, car ce sont les sources éditoriales.

Ne partagez jamais le token GitHub. En cas de doute, révoquez-le dans GitHub et créez-en un nouveau.

## Organisation recommandée

L’éditeur doit rester dans un dépôt ou un dossier séparé du site public.

Le site public doit contenir les fichiers nécessaires à GitHub Pages.

L’éditeur doit uniquement se connecter au dépôt du site, charger ses contenus, générer les fichiers publics, puis publier les changements.

Cette séparation permet de garder un site public propre, sans interface d’administration exposée aux visiteurs.
