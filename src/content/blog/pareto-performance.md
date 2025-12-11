---
title: Tech - Ça vous parait du Pareto?
pubDate: 2025/12/08
description: Comment j'ai divisé par 4 le temps d'exécution de nos tests unitaires front en quelques heures seulement.
tags: ['jest', 'performances', 'tests unitaires']
author: Marco
---

### Stack du projet
|                   |                                  |
|-------------------|----------------------------------|
| Système de build  | vite                             |
| Framework front   | react                            |
| Framework de test | React testing libray (avec jest) |
| CI                | github                           |


# Intro sur pareto

Si l'on en croit Wikipédia, Vilfredo Pareto était un économiste et sociologue italien qui été un des premiers à observer que 80% des richesses étaient détenues en Italie par 20% des Italiens. Ce ratio de 80/20 a été par la suite observé dans de nombreux cas et porte désormais le nom de principe de Pareto. Ce principe s'applique toujours de nos jours dans de nombreux domaines : 80% des pannes d'une machine sont dues à 20% des pièces de celle-ci. 80% du temps perdu sur un trajet le sera su 20% de sa distance. Il est donc logique de penser que 20% des tests unitaires conduisent à 80% des messages d'erreur remontés.

# Etat des lieux

Depuis plusieurs semaines, plusieurs signaux faibles m'ont montrés qu'il y avait quelque chose à faire concernant une suite de tests unitaires front. D'abord, la CI qui est "longue". Aussi, les tests sont relativement longs à passer en local, d'une durée similaire. Ensuite, selon la période, certains tests ont l'air "flaky", parfois, ils passent, parfois, ils ne passent pas, sans que la base de code concernée n'ait été touchée. Enfin, plusieurs messages de diverses sources commençaient à remonter un problème avec nos tests. Ni une ni deux, me voici en quête d'une solution pour améliorer tout ça.

# Analyse

"On ne peut améliorer ce qu'on ne peut mesurer". En suivant cette expression à la lettre, j'ai déjà commencé par observer ce qui se passe avant toute modification. Le résultat est le suivant :

```
Test Suites: 1 failed, 2 skipped, 124 passed, 125 of 127 total
Tests: 1 failed, 10 skipped, 1002 passed, 1013 total
Snapshots: 0 total
Time: 80.646 s
```

1. Selon Michael Feathers, dans Working Effectively With Legacy Code, un "test unitaire qui prend plus d'un dixième de seconde pour tourner est un test lent”. Ce n'est pas une vérité en soi, mais ça permet d'avoir un point de référence.

    Ici, selon des calculs très savants, un test prend environ 0,08sec, ce qui n'est pas loin du 0.1 sec donné par Michael Feathers.
    
    Cependant, nous sommes en 2025 et nos machines sont plus puissantes que jamais. Il n'y a donc pas de raison de ne pas vouloir aller plus vite, surtout qu'après une première analyse, certains tests tournent en 10ms.
2. On voit aussi dans la capture d'écran qu'il y a un test qui échoue, sans parler des 10 tests qui sont ignorés.

3. Environ 1 run sur 100 dans la CI aboutit à un échec de la suite de test, qui finit par passer si on exécute à nouveau la suite.

4.  une suite de tests en particulier finit régulièrement en timeout (30 secondes).

Ces éléments mis bout à bout nécessitent donc une analyse des améliorations possibles.

Cette analyse a été effectuée avec Claude Code, pour 3 raisons principales:
- l'apprentissage. Je n'ai pas encore l'habitude de me pencher sur des sujets comme celui-ci qui me sortent de la production quotidienne.
- la rapidité d'analyse. Je préfère une analyse 80% correcte en 1 minute que passer 3 jours à avoir moins de 20% du même résultat.
- les propositions d'amélioration : J'avais identifié plusieurs problèmes et potentielles solutions et avoir une aide supplémentaire est un vrai plus.

Voici un résumé rapide de ce qui en est ressorti (triés par ordre de gain potentiel) :
- exécution séquentielle et non en parallèle
- le setup de test est mal configuré (plusieurs manières de gérer les mocks).
- QueryClient réinstancié dans de nombreux de tests
- patterns de tests inefficaces (waitFor quand il n'y en a pas besoin)
- tests mal écrits patchés avec des jest.setTimeout
- tests unitaires qui ne sont pas des tests unitaires
- mauvaise composition des pages react (composants mal écrits)
- architecture trop complexe


Spoiler : toutes les hypothèses ne seront pas testées, mais seulement celles qui ont l'air d'être le plus rapide à mettre en place et qui ont l'air d'apporter le plus de gains.
# Exécution

Maintenant que nous savons ce qui semble poser des problèmes, attaquons-nous à les résoudre

Pour cela, la première étape a été de paralléliser l'exécution de la suite de test.
Jest propose une option pour cela : `--maxWorkers`
Ici, j'ai ajouté cette option `maxWorkers: '50%',` dans jest.config.ts. Cela peut aussi être passé en option CLI.

La deuxième étape a été de refactorer les endpoints msw. Auparavant, les handlers msw étaient répartis un peu partout et les tests avaient tendance à démarrer le server msw par eux même alors que d'autres instances étaient déjà démarrées (globalement et par d'autres tests). On est donc passé d'un `server.setupServer()` un peu partout à une instanciation unique (singleton) dans un seul fichier appelé au démarrage de jest.

Avec ces 2 modifications, on a déjà ce résultat :

```
Test Suites: 2 failed, 2 skipped, 123 passed, 125 of 127 total
Tests: 3 failed, 10 skipped, 1000 passed, 1013 i total
Snapshots: 0 total
Time: 46.843 s, estimated 47 s
```

On a donc déjà divisé quasiment par 2 le temps de test, mais on peut voir que certains tests échouent. Cela est dû au fait qu'on parallélise et que certains tests étaient fait en séquence.

Le fix est au final plutôt simple pour nos tests qui échouent : le problème venait du `waitFor` :
`await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())` devient `await screen.findByRole('table')`

Avec ces nouveaux correctifs, on obtient maintenant ce résultat :
```
Test Suites: 2 skipped, 125 passed, 125 of 127 total
Tests: 10 skipped, 1003 passed, 1013 total
Snapshots: 0 total
Time: 39.318 s
```

50% de temps de gagné avec ces quelques correctifs ! Pas mal non ? ~~C'est français~~

Il reste un dernier point à analyser. Y a-t-il des tests vraiment longs par rapport à d'autres ?

Oui, surtout un : 5 d'entre eux prennent 5 secondes en moyenne à s'exécuter. Maintenant qu'on a supprimé les `jest.setTimeout(30000)`, ces tests plantent plus régulièrement...

On remet les mains dans le cambouis et c'est reparti pour un tour.

Dans le test initial, beaucoup d'interaction sont simulées via `userEvent`de React testing library. L'avantage est que cela simule un comportement utilisateur qui tape ou qui clique dans un formulaire. L'inconvénient est que cela simule aussi une certaine lenteur. J'ai tenté de désactiver cette lenteur sans succès, je me suis donc rabattu sur `fireEvent` comme remplaçant. C'est le jour et la nuit, car après application, on arrive à un chiffre de

```
Test Suites: 2 skipped, 125 passed, 125 of 127 total
Tests: 10 skipped, 1003 passed, 1013 total
Snapshots: 0 total
Time: 39.318 s
```

15 SECONDES!!!!
En quelques heures seulement, j'ai permis d'économiser 65 secondes à chaque fois que les tests sont lancés. En considérant que les tests sont lancés au moins 2 fois par jour par chaque personne qui travaille sur la base de code (environ 50), on arrive à 50* 2 * 65 = 6500 secondes soit 1h48 de "gagné".

À mon avis, Pareto a encore de beaux jours devant lui. 4 problèmes identifiés ont permis de réduire d'environ 80% le temps pour exécuter la suite de test.

Une prochaine fois, pensez à Vilfredo pour maximiser vos gains !
