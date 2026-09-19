---
title: "MaClasse — Politique de confidentialité"
date: 2026-09-19
lastmod: 2026-09-19
draft: false
hidden: true
summary: "Comment MaClasse traite vos données."
# Copied from the MaClasse repository's PRIVACY.fr.md. Keep the two in sync: edit
# PRIVACY.fr.md, then paste its body (without the "# " title line) below this front matter and
# bump lastmod.
---

*[English version](/apps/maclasse/privacy/)*

*Dernière mise à jour : 19 septembre 2026*

MaClasse est une application pour les enseignants. **L'application elle-même ne collecte rien,
n'a aucun serveur, et le développeur n'a accès à aucune des données que vous saisissez.** Si
vous activez la synchronisation optionnelle de l'emploi du temps Pronote, l'application effectue
un seul type de requête sortante — décrite ci-dessous — et rien d'autre ne change. L'abonnement
optionnel MaClasse Pro est acheté via Google Play, dont la bibliothèque Play Billing intégrée
envoie ses propres diagnostics à Google pour chaque utilisateur ; voir plus bas.

## Ce que l'application enregistre, et où

Tout ce que vous créez — classes, élèves, photos, notes, champs personnalisés, rappels,
emplois du temps, salles, plans de classe, groupes, et vos réglages — est stocké
**uniquement dans le stockage privé de l'application sur votre appareil**. Rien n'est envoyé
ailleurs.

Il n'y a pas de compte, pas de connexion, pas d'analytics, pas de publicité, pas de rapport de
plantage, et aucun SDK tiers qui collecte des données d'usage, hormis les propres diagnostics de
la bibliothèque Google Play Billing décrits ci-dessous.

## Quand des données quittent l'appareil

Uniquement lorsque vous le décidez volontairement :

- **Sauvegarde** — vous choisissez une destination via le sélecteur de fichiers d'Android. Si
  vous choisissez un dossier cloud comme Google Drive, le fichier va chez ce fournisseur sous
  votre propre compte, et sa politique de confidentialité s'applique à partir de ce moment. Vous
  pouvez protéger le fichier avec un mot de passe, qui le chiffre avec AES-256-GCM (clé dérivée
  avec PBKDF2-SHA256, 200 000 itérations). C'est fortement recommandé, car une sauvegarde
  contient des noms d'élèves, des photos et des notes.
- **Synchronisation du calendrier** — si vous l'utilisez, les horaires de cours, les noms de
  classes et les noms de salles sont écrits dans un calendrier local nommé « MaClasse » sur
  votre appareil. Si ce compte de calendrier est lui-même synchronisé vers un service en ligne
  par votre téléphone, ces entrées le suivent.
- **Synchronisation de l'emploi du temps Pronote** — si vous saisissez un lien d'abonnement iCal
  Pronote dans les Réglages, l'application effectue exactement un type de requête sortante : une
  requête HTTPS GET vers ce lien, qui pointe vers le serveur Pronote de votre propre
  établissement. Aucun autre hôte n'est contacté, rien de ce que vous saisissez sur les élèves,
  les classes ou les salles n'est envoyé, et l'application ne suit pas les redirections. Cette
  requête a lieu selon la fréquence que vous choisissez (hebdomadaire par défaut, ou
  quotidienne, ou seulement quand vous demandez une vérification) et son résultat n'est jamais
  écrit automatiquement dans vos données — il ne fait que déclencher une notification, et chaque
  changement n'est écrit qu'après que vous l'avez examiné et approuvé. Le lien d'abonnement
  lui-même est un identifiant porteur (*bearer credential*) : quiconque le possède peut lire
  votre emploi du temps sans aucune authentification supplémentaire. Il est stocké sur
  l'appareil et affiché masqué dans l'application, et il n'est inclus dans un fichier de
  sauvegarde **que si cette sauvegarde est protégée par mot de passe** ; une sauvegarde non
  chiffrée l'omet.
- **Abonnement MaClasse Pro** — si vous vous abonnez, l'achat est effectué et géré entièrement
  par Google Play sous votre compte Google, et la politique de confidentialité de Google
  s'applique. L'application demande à l'application Play Store de votre téléphone si
  l'abonnement est actif, et la bibliothèque Google Play Billing incluse dans l'application
  envoie à Google des données de diagnostic sur son propre fonctionnement, également sous la
  politique de confidentialité de Google — cela se produit chaque fois que l'application vérifie
  l'abonnement, y compris pour les utilisateurs qui ne s'abonnent jamais. Cela n'inclut jamais
  de classes, d'élèves, de notes, ni rien de ce que vous saisissez. Le développeur ne reçoit
  aucune donnée personnelle au-delà des relevés de commande que Google Play fournit à chaque
  développeur.

## Permissions demandées par l'application, et pourquoi

| Permission | Pourquoi |
|---|---|
| `POST_NOTIFICATIONS` | pour afficher vos rappels et le résumé du matin |
| `SCHEDULE_EXACT_ALARM` | pour qu'un rappel arrive à l'heure que vous avez fixée |
| `RECEIVE_BOOT_COMPLETED` | pour restaurer les rappels en attente après le redémarrage du téléphone |
| `READ_CALENDAR`, `WRITE_CALENDAR` | uniquement si vous utilisez la synchronisation optionnelle du calendrier |
| `INTERNET`, `ACCESS_NETWORK_STATE` | pour la requête Pronote, si vous avez défini un lien d'abonnement, et pour les propres diagnostics de la bibliothèque Google Play Billing (voir ci-dessus) |
| `com.android.vending.BILLING` | pour acheter et vérifier l'abonnement MaClasse Pro via Google Play |
| Appareil photo (fonctionnalité optionnelle) | uniquement si vous prenez la photo d'un élève avec l'appareil photo |

Il n'y a aucune permission de localisation, de contacts ou de microphone.

## Données concernant des mineurs

L'application est destinée aux enseignants, pas aux élèves, et n'est pas dirigée vers les
enfants. Mais les données que vous saisissez décrivent des élèves, qui sont souvent mineurs.
Vous restez la personne responsable de ces données au titre du RGPD et des règles de votre
établissement. En pratique : utilisez un verrouillage d'appareil, chiffrez vos sauvegardes, et
supprimez les données dont vous n'avez plus besoin.

## Suppression de vos données

Désinstaller l'application supprime tout ce qu'elle avait stocké sur l'appareil. Les fichiers de
sauvegarde que vous avez exportés vous-même ne sont pas concernés — supprimez-les là où vous les
avez enregistrés.

## Modifications

Tout changement apporté à cette politique apparaîtra dans ce fichier, avec la date ci-dessus
mise à jour.

## Contact

nosari20@gmail.com

Copie publique : https://nosari20.github.io/apps/maclasse/confidentialite/
