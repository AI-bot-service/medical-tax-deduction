import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Политика обработки персональных данных — МедВычет",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">
        Политика обработки персональных данных
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        Редакция от 18 марта 2026 года
      </p>

      <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
        <section>
          <h2 className="text-base font-semibold text-gray-800">1. Общие положения</h2>
          <p>
            Настоящая Политика обработки персональных данных (далее — Политика)
            разработана в соответствии с требованиями Федерального закона от 27.07.2006
            № 152-ФЗ «О персональных данных» и определяет порядок обработки персональных
            данных пользователей сервиса МедВычет (далее — Сервис).
          </p>
          <p className="text-yellow-700 bg-yellow-50 rounded-lg p-3 text-sm border border-yellow-100">
            ⚠️ Данный текст является placeholder-версией. Окончательный текст политики
            должен быть подготовлен юристом с учётом специфики обработки медицинских данных
            согласно ст. 10 152-ФЗ.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800">2. Оператор персональных данных</h2>
          <p>
            Оператором персональных данных является [наименование юридического лица],
            зарегистрированное по адресу: [адрес], ОГРН: [ОГРН], ИНН: [ИНН].
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800">3. Категории обрабатываемых данных</h2>
          <p>Сервис обрабатывает следующие категории персональных данных:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Номер мобильного телефона (хранится в виде хеша bcrypt)</li>
            <li>Telegram ID и имя пользователя</li>
            <li>Фамилия, имя, отчество (шифруются AES-256)</li>
            <li>ИНН (шифруется AES-256)</li>
            <li>СНИЛС (шифруется AES-256)</li>
            <li>
              <strong>Специальные категории ПД:</strong> сведения о состоянии здоровья —
              наименования лекарственных препаратов, даты и суммы покупок в аптеках,
              данные рецептов (ст. 10 152-ФЗ)
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800">4. Цели обработки</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Формирование пакета документов для получения налогового вычета (ст. 219 НК РФ)</li>
            <li>Авторизация пользователей</li>
            <li>Направление уведомлений через Telegram</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800">5. Безопасность данных</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Все данные хранятся на серверах в Российской Федерации</li>
            <li>Специальные категории ПД шифруются алгоритмом AES-256</li>
            <li>Передача данных защищена TLS 1.3</li>
            <li>Доступ к БД ограничен механизмами Row Level Security (RLS)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800">6. Права субъектов данных</h2>
          <p>
            Пользователь вправе: получить информацию об обработке своих ПД; потребовать
            исправления или удаления данных; отозвать согласие. Для реализации прав
            обратитесь по адресу: [email для обращений].
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-800">7. Согласие на обработку медицинских данных</h2>
          <p>
            В соответствии со ст. 10 152-ФЗ обработка специальных категорий персональных
            данных (сведений о состоянии здоровья) осуществляется только при наличии
            явного письменного согласия субъекта. Такое согласие запрашивается при первом
            использовании функций загрузки чеков и рецептов.
          </p>
        </section>
      </div>

      <div className="mt-10 pt-6 border-t border-gray-100">
        <a href="/" className="text-sm text-blue-500 hover:underline">
          ← На главную
        </a>
      </div>
    </main>
  );
}
