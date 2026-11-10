# SouqNova

Boutique en ligne (paiement à la livraison, Maroc).

- `index.html` : vitrine statique hébergée sur GitHub Pages.
- `worker.js` : Cloudflare Worker `souqnova-api`. Il fait le lien entre la vitrine et l'API Mowarid. Il recalcule les frais de livraison et fait revalider le prix auprès du fournisseur avant toute commande.

## Déploiement du Worker

```
npx wrangler secret put MOWARID_API_KEY
npx wrangler deploy
```

La clé API reste un secret Cloudflare : ne jamais la mettre dans le code.
