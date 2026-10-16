import type {Metadata} from "next";
import Link from "next/link";
import "./page.css";

export const metadata:Metadata={
 title:"Konto und Daten löschen | RescueEd Alert",
 description:"Löschung Ihres RescueEd Alert Kontos und der zugehörigen Daten anfordern – auch ohne App oder Anmeldung.",
 alternates:{canonical:"https://alert-rescueed.de/konto-loeschen"},
};

const email="info_ra@rescueed.de";
const mailto=`mailto:${email}?subject=${encodeURIComponent("RescueEd Alert – Konto und zugehörige Daten löschen")}&body=${encodeURIComponent("Guten Tag,\n\nich möchte mein RescueEd Alert Konto und die zugehörigen personenbezogenen Daten löschen lassen.\n\nE-Mail-Adresse des Kontos: \nName / Organisation (falls vorhanden): \n\nBitte bestätigen Sie die Bearbeitung und teilen Sie mir mit, welche Daten gegebenenfalls aus welchem Grund und bis wann aufbewahrt werden.\n")}`;

export default function AccountDeletionPage(){
 return <main className="deletion-page"><article>
  <Link href="/" className="deletion-back">Zurück zu RescueEd Alert</Link>
  <p className="deletion-brand">RescueEd Alert · RescueEd – Benjamin Peinzger</p>
  <h1>Konto und Daten löschen</h1>
  <p>Sie können hier die Löschung Ihres RescueEd Alert Kontos und der zugehörigen personenbezogenen Daten anfordern. Dafür benötigen Sie weder die installierte App noch eine Anmeldung auf dieser Webseite.</p>

  <section aria-labelledby="request-heading" className="deletion-request">
   <h2 id="request-heading">Löschung per E-Mail anfordern</h2>
   <ol>
    <li>Schreiben Sie möglichst von der E-Mail-Adresse, mit der Ihr Konto registriert ist, an <a href={`mailto:${email}`}>{email}</a>.</li>
    <li>Verwenden Sie den Betreff „RescueEd Alert – Konto und zugehörige Daten löschen“. Nennen Sie die Konto-E-Mail-Adresse und gegebenenfalls Ihre Organisation.</li>
    <li>Wir prüfen die Zuordnung zum Konto. Falls Sie keinen Zugriff mehr auf die registrierte E-Mail-Adresse haben, teilen Sie uns dies mit; wir klären mit Ihnen eine andere Möglichkeit zur Identitätsprüfung.</li>
   </ol>
   <a className="deletion-action" href={mailto}>Löschanfrage im E-Mail-Programm öffnen</a>
   <p>Kein E-Mail-Programm eingerichtet? Kopieren Sie <strong>{email}</strong> in Ihr Webmail-Postfach. Das Öffnen des Links sendet noch keine Nachricht und löscht noch kein Konto.</p>
   <p><strong>Bitte senden Sie niemals Ihr Passwort, Sicherheitscodes oder Zahlungsdaten mit.</strong></p>
   <p>Der Antrag umfasst das Konto und die zugehörigen Daten, nicht nur die Abmeldung. Nach Prüfung erhalten Sie eine Rückmeldung zur Durchführung und zu gegebenenfalls verbleibenden Aufbewahrungsfristen.</p>
  </section>

  <section aria-labelledby="app-heading">
   <h2 id="app-heading">Alternativ direkt in App oder Browser</h2>
   <ul>
    <li><strong>Privatkonto in der App:</strong> Melden Sie sich an, öffnen Sie Ihre Eventübersicht und wählen Sie „Privatkonto löschen“. Geben Sie Ihr Passwort ein und bestätigen Sie die Löschung.</li>
    <li><strong>Organisations-Hauptkonto:</strong> Melden Sie sich im Browser an und öffnen Sie „Mein Profil“ → „Account löschen“. Bestätigen Sie mit Ihrem Passwort.</li>
    <li><strong>Helfer ohne eigenes Konto:</strong> Nennen Sie in Ihrer E-Mail Ihren Namen und das betreffende Event. Bei Daten eines Veranstalters wird die Zuständigkeit für die Löschung mit diesem geklärt.</li>
   </ul>
  </section>

  <section aria-labelledby="subscription-heading">
   <h2 id="subscription-heading">Ein Store-Abo separat kündigen</h2>
   <p>Die Kontolöschung beendet ein Google-Play- oder Apple-App-Store-Abo nicht automatisch. Kündigen Sie es zusätzlich im jeweiligen Store, um weitere Abbuchungen zu vermeiden. Eine Kündigung ist keine Voraussetzung dafür, eine Löschanfrage zu stellen.</p>
   <p><a href="https://play.google.com/store/account/subscriptions">Google-Play-Abos verwalten</a> · <a href="https://apps.apple.com/account/subscriptions">Apple-Abos verwalten</a></p>
  </section>

  <section aria-labelledby="data-heading">
   <h2 id="data-heading">Welche Daten werden gelöscht?</h2>
   <p>Die Kontolöschfunktion macht die Anmeldung sofort unmöglich, entfernt Sitzungen und Sicherheitscodes und anonymisiert die aktiven Kontaktdaten des Kontos. Kontobezogene Support-Tickets und die lokale App-Abo-Zuordnung werden entfernt. Aktive eigene Events werden beendet; bei Organisations-Hauptkonten betrifft dies auch die zugehörigen Event-Benutzer.</p>
   <p>Event-, Dienstplan-, Helfer-, Geräte- und Alarmdaten sind gesonderte Datensätze. Die Kontolöschfunktion allein entfernt nicht sofort sämtliche Eventdaten. Ein Löschantrag über diese Seite umfasst ausdrücklich auch die Prüfung und Löschung dieser zugehörigen Daten, soweit keine begründete Aufbewahrung erforderlich ist. Die automatische Helferbereinigung ist für 30 Tage nach dem tatsächlichen Eventende vorgesehen.</p>
   <p>Bereits von Veranstaltern heruntergeladene oder ausgedruckte Protokolle können wir nicht aus deren Geräten oder Unterlagen entfernen. Hierfür ist der jeweilige Empfänger zuständig.</p>
  </section>

  <section aria-labelledby="retention-heading">
   <h2 id="retention-heading">Welche Daten können noch aufbewahrt werden?</h2>
   <ul>
    <li><strong>Vertrags- und Einwilligungsnachweise:</strong> Im getrennten Löscharchiv bleiben insbesondere Name, Konto-E-Mail-Adresse und Nachweise zu akzeptierten Rechtstexten grundsätzlich bis zum Ende des dritten Kalenderjahres nach der Kontolöschung. Bei App-Abos wird das tatsächliche Vertragsende zusätzlich geprüft.</li>
    <li><strong>Abrechnungsnachweise:</strong> Soweit vorhanden, werden sie im aktuellen Aufbewahrungssystem bis zum Ende des achten Kalenderjahres nach Erstellung gespeichert.</li>
    <li><strong>Begründete Aufbewahrungssperren:</strong> Beispielsweise bei offenen Rechtsansprüchen oder ungeklärtem Vertragsende kann eine gesonderte Aufbewahrung erforderlich sein. Über betroffene Daten, Grund und Dauer informieren wir bei der Bearbeitung.</li>
    <li><strong>Technische Daten und Sicherungskopien:</strong> Technische Absturzberichte werden nach 30 Tagen bereinigt. Verschlüsselte Sicherungskopien werden im regulären täglichen Sicherungslauf nach ihrem 29. Tag entfernt; die reguläre Aufbewahrung beträgt damit höchstens 30 Tage. Das Löschen aus dem aktiven System entfernt nicht gleichzeitig jede ältere Sicherungskopie.</li>
   </ul>
   <p>Weitere Informationen finden Sie in unserer <Link href="/rechtliches/datenschutz">Datenschutzerklärung</Link>. Bei Fragen zur Löschung erreichen Sie RescueEd – Benjamin Peinzger unter <a href={`mailto:${email}`}>{email}</a>.</p>
  </section>
 </article></main>;
}
