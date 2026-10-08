# Kontakti: Ajo ja kulut – yksinkertaistaminen 8.10.2026

Toteutettu feat/ajo-ja-kulut-haarassa käyttäjän hyväksymä yksi lomake: päivämäärä, lähtöpaikka, useita kohteita, ajon tarkoitus, käsin syötetty km ja €/km, lisättävät kulut ja kuittikuvat, vapaaehtoinen muistiinpano, yhteenveto sekä yksi tallennuspainike. Kilometrihakua/karttapainiketta ei lisätty.

Tallennetut omat lähtöpaikat ja kohteet muistetaan käyttäjä- ja workspacekohtaisesti tässä selaimessa. Kontaktin olemassa olevat asiakasosoitteet näkyvät valinnoissa. Kululajit käyttävät olemassa olevia palvelimen hyväksymiä kategorioita. €/km muistetaan käyttäjän antamasta arvosta; koodiin ei asetettu korvaustaksaa.

Yhdistetty tallennus käyttää olemassa olevia kontakti_create_trip / kontakti_create_expense -RPC:itä, nykyisiä RLS-rajoja ja yksityistä kuittibucketia. Ajo ja jokainen kulu varmennetaan erikseen. Koko kirjaus ei ole yksi tietokantatransaktio: osittaisessa onnistumisessa lomake lukitaan ja samoilla UUID-tunnisteilla voi jatkaa ilman tuplia. Luonnos säilyy sessionStorageen; sivulatauksen jälkeen kuittikuvat valitaan uudelleen. Pysyvästi epäselvän tallennuksen selvitys voi vaatia historiatarkistuksen. Käyttäjälle ei näytetä onnistumista ennen varmennusta.

Kuitti ilman kulusummaa tallennetaan Muu-kategorian nollasummaisena liitteenä. Raportti avataan erikseen. PDF/tulostus hakee kuittikuvat lyhytikäisillä allekirjoitetuilla osoitteilla ja odottaa kuvien latautumisen.

Tarkistukset: 8 Node-testiä läpäisi. Paikallinen selaintesti simuloidulla pilvipolulla: kaksi kulua, yhteyskatko ensimmäisen kulun tallennuksen jälkeen, uudelleenyritys ilman tuplia (1 ajo / 2 kulua), luonnoksen palautus, osittaisen tallennuksen palautus sivulatauksen yli (1 ajo / 1 kulu), kuittiliite ilman summaa, raportin kuvan lataus. 390 px puhelinleveys: ei kenttien ylivuotoa. Testit eivät kirjoittaneet tuotanto-Supabaseen.

Julkaisutila: paikallinen toteutus ja testattu esikatselu. GitHub Pagesin tuotantolähde on main, tämä työ on feat/ajo-ja-kulut-haarassa. Tuotantojulkaisua tai oikean puhelimen pilvitallennusta ei tämän työn yhteydessä varmennettu.

Esikatselu: http://127.0.0.1:3011/tests/preview.html (paikallinen esimerkkitietokanta). Aito sovellus: cloud-ui-v2.html, tarvitsee normaalin kirjautumisen.

Hub-raportointi: Renderin istunto päättyi päivityksen hyväksyntäyrityksen yhteydessä; lopputulosta ei saatu uudella luvulla varmennettua. Ehdotus ja este: output/hub-pending/contact-2026-10-08.json. Seuraavaksi kirjaudu Hubiin, lue nykyinen contact-tila ja historia; sovita/lähetä vain jos muutos puuttuu.

Hub-varmennus 8.10.2026: uusi kirjautuminen, odottanut contact-päivitys hyväksytty. Nykytila ja historia varmennettu täydellä sivulatauksella. Pending-ehdotus merkitty varmennetuksi; sitä ei lähetetä uudelleen.

UI-viimeistely 8.10.2026 käyttäjän palautteen mukaan: esikatselun testitekstit/testipainike piilotettu, esimerkkipaikkatekstit poistettu. Kulun lisääminen erillisessä dialogissa (kululaji, vapaaehtoinen kuvaus, summa), tiivis yhteenvetorivi, muokkaus ja peruutus. Raportin lihavointeja kevennetty ja kuitin tekninen hash poistettu näkyvästä kulurivistä. Kahdeksan testiä läpäisi; selaimessa kulun lisääminen, muokkaus ja peruutus tarkistettu. Tuotantoon ei julkaistu.

Teemat/ulkoasu 8.10.2026: poistettu esikatselun OPERO KONTAKTI -yläotsikko ja Kirjaa kentällä -ohjeteksti. Yhteiset Kontakti-teemat, vaalea esikatselu, date-kentän color-scheme molemmissa tiloissa, kevyet sivutoiminnot, selkeä loppusumma, kulurivit ilman sisäkkäisiä kortteja. 8 testiä läpäisi, molemmat teemat tarkistettu selaimessa. Valikkosijoitus odottaa oikean version osoitetta: nykyisessä cloud-ui-v2.html:ssa Ajo ja kulut on välilehti, Viikkoraporttia/alasvetovalikkoa ei ole. origin/main be4341b sisältää aiemman feature-haaran merge-PR:n #1; tämän kierroksen main-julkaisua ei tehty.
