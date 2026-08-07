/*
 * TRAVAUX AVANT / APRÈS
 *
 * Dupliquez un objet pour ajouter une nouvelle réalisation.
 * N’ajoutez ici que des photos réelles dont la publication a été autorisée.
 * Les deux images d’une paire doivent avoir le même cadrage et les mêmes dimensions.
 */
window.ROMANYCK_REALISATIONS = [
    {
        order: 1,
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
