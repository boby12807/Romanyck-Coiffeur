/*
 * TRAVAUX AVANT / APRÈS
 *
 * Dupliquez un objet pour ajouter une nouvelle réalisation.
 * N’ajoutez ici que des photos réelles dont la publication a été autorisée.
 * Les deux images d’une paire doivent avoir le même cadrage et les mêmes dimensions.
 */
window.ROMANYCK_REALISATIONS = [
    {
        id: 'coupe-blond-2026-01',
        order: 1,
        visible: true,
        category: 'Balayage',
        title: 'Coupe & blond fondu',
        description: 'Un blond plus lumineux et une coupe nette pour retrouver de la douceur et du mouvement.',
        before: {
            fallback: 'assets/realisations/coupe-blond-before.jpg',
            alt: 'Chevelure brune aux longueurs blondes avant la coupe et le balayage',
            width: 1091,
            height: 1400
        },
        after: {
            fallback: 'assets/realisations/coupe-blond-after.jpg',
            alt: 'Carré blond lumineux après la coupe et le balayage',
            width: 851,
            height: 1400
        }
    },
    {
        id: 'blond-long-2026-02',
        order: 2,
        visible: true,
        category: 'Couleur',
        title: 'Blond beige lumineux',
        description: 'Un travail de lumière nuancé pour un blond beige naturel et multidimensionnel.',
        before: {
            fallback: 'assets/realisations/blond-long-before.jpg',
            alt: 'Chevelure longue et lisse avant le travail de couleur',
            width: 648,
            height: 1400
        },
        after: {
            fallback: 'assets/realisations/blond-long-after.jpg',
            alt: 'Chevelure blonde ondulée après le travail de couleur',
            width: 646,
            height: 1400
        }
    },
    {
        id: 'balayage-boucles-2026-03',
        order: 3,
        visible: true,
        category: 'Balayage',
        title: 'Balayage & mouvement',
        description: 'Des reflets fondus et un coiffage wavy pour illuminer les longueurs et révéler leur mouvement.',
        before: {
            fallback: 'assets/realisations/balayage-boucles-before.jpg',
            alt: 'Chevelure brune texturée avant le balayage et le coiffage',
            width: 648,
            height: 1400
        },
        after: {
            fallback: 'assets/realisations/balayage-boucles-after.jpg',
            alt: 'Chevelure balayée et coiffée en ondulations après la prestation',
            width: 703,
            height: 1400
        }
    },
    {
        id: 'default-balayage-01',
        order: 4,
        visible: true,
        category: 'Balayage',
        title: 'Transformation avant / après',
        description: 'Une réalisation effectuée au salon, présentée en comparaison avant et après.',
        before: {
            webp: 'assets/balayage_before.webp',
            fallback: 'assets/balayage_before.jpg',
            alt: 'Chevelure avant la prestation, vue de dos',
            width: 1024,
            height: 1024
        },
        after: {
            webp: 'assets/balayage_after.webp',
            fallback: 'assets/balayage_after.jpg',
            alt: 'Chevelure après la prestation, vue de dos',
            width: 1024,
            height: 1024
        }
    }
];
